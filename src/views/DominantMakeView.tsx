/**
 * "Dominant Vehicle Make by Postcode" categorical preset.
 *
 * Colour = the leading make (a fixed top-5 palette + "Other"); opacity = how
 * strongly it leads. Renders the same way as Explore and EV x SES: a
 * UniqueValueRenderer keyed on POSTCODE swapped onto the SHARED layer, so
 * switching in and out never re-tessellates geometry and the extent is kept.
 */
import { useEffect, useRef, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type MapView from "@arcgis/core/views/MapView";
import type Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import ArcFeatureLayer from "@arcgis/core/layers/FeatureLayer";
import ArcGraphic from "@arcgis/core/Graphic";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import type Polygon from "@arcgis/core/geometry/Polygon";

import { getYearData } from "../engine/loadData";
import type { DataStore } from "../engine/loadData";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import {
  computeDominantMake,
  computeMakeBreakdown,
  buildDominantRenderer,
  buildPieClusterReduction,
  buildMakePopupContent,
  PIE_FIELDS,
  ALPHA_MIN,
  ALPHA_MAX,
  type DominantLegendItem,
  type DominantMake,
  type StrengthDomain,
} from "../engine/dominantMake";
import type UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import { ControlStrip } from "../components/ControlStrip";
import { MapCard, MapCardRow } from "../components/MapCard";
import { SegmentedControl } from "../components/SegmentedControl";

interface Props {
  layer: FeatureLayer;
  view: MapView;
  dataStore: DataStore;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
  graphicsByPostcode: Map<string, Graphic>;
}

export function DominantMakeView({ layer, view, dataStore, year, years, onYearChange, graphicsByPostcode }: Props) {
  const [ready, setReady] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<DominantLegendItem[]>([]);
  const [strength, setStrength] = useState<StrengthDomain | null>(null);
  const [pieMode, setPieMode] = useState(false);
  const dominantRendererRef = useRef<UniqueValueRenderer | null>(null);
  const breakdownRef = useRef<Map<string, { toyota: number; ford: number; holden: number; merc: number; hyundai: number; other: number; total: number }>>(new Map());
  // Subtle postcode boundary layer shown only in pie mode (outlines give geographic
  // context since the pies sit at centroids on a separate layer).
  const outlineLayerRef = useRef<GraphicsLayer | null>(null);
  // The dedicated pie layer (see buildPieLayer below).
  const pieLayerRef = useRef<ArcFeatureLayer | null>(null);

  // Pie mode uses a DEDICATED point layer (one point per postcode centroid, B-005 fix).
  // Top-5 makes only (Other dropped, E-016) so year-to-year and geographic variation reads.
  // Subtle drop-shadow via layer.effect (E-015) makes pies pop off the basemap.
  const PIE_ALL_FIELDS = [...PIE_FIELDS, "TOTAL_COUNT", "POSTCODE"] as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildPiePopupContent = (event: { graphic: { attributes: Record<string, any> } }) => {
    const a = event.graphic.attributes as Record<string, number>;
    const pc = (a as Record<string, unknown>).POSTCODE as string | undefined;
    const scope = pc
      ? `${(a.TOTAL_COUNT ?? 0).toLocaleString()} total registrations`
      : `${(a.TOTAL_COUNT ?? 0).toLocaleString()} registrations`;
    return buildMakePopupContent(a, "", scope);
  };

  const buildPieLayer = (): ArcFeatureLayer => {
    const points: ArcGraphic[] = [];
    let oid = 1;
    for (const g of graphicsByPostcode.values()) {
      const a = g.attributes as Record<string, unknown>;
      if (!((a.TOTAL_COUNT as number) > 0)) continue;
      const centroid = (g.geometry as Polygon | null)?.centroid;
      if (!centroid) continue;
      const attrs: Record<string, unknown> = { OBJECTID: oid++ };
      for (const f of PIE_ALL_FIELDS) attrs[f] = a[f] ?? 0;
      attrs.POSTCODE = a.POSTCODE;
      points.push(new ArcGraphic({ geometry: centroid, attributes: attrs }));
    }
    return new ArcFeatureLayer({
      source: points,
      objectIdField: "OBJECTID",
      geometryType: "point",
      spatialReference: view.spatialReference,
      fields: [
        { name: "OBJECTID", type: "oid" },
        { name: "POSTCODE", type: "string" },
        ...PIE_FIELDS.map((name) => ({ name, type: "double" as const })),
        { name: "TOTAL_COUNT", type: "double" as const },
      ] as any,
      renderer: new SimpleRenderer({
        symbol: new SimpleMarkerSymbol({ size: 1, color: [0, 0, 0, 0], outline: { width: 0 } }),
      }),
      featureReduction: buildPieClusterReduction() as any,
      popupTemplate: {
        title: "Postcode {POSTCODE}",
        content: buildPiePopupContent,
      } as any,
      legendEnabled: false,
      effect: "drop-shadow(1px, 1px, 3px, rgba(0,0,0,0.25))",
    });
  };

  // Cross-fade: build the new pie layer on top, wait for the layerView to finish its first
  // render, then remove the old layer. Eliminates the flash/flicker on year changes.
  const showPieLayer = async () => {
    const newLayer = buildPieLayer();
    view.map?.add(newLayer);
    const oldLayer = pieLayerRef.current;
    pieLayerRef.current = newLayer;
    layer.visible = false;
    layer.featureReduction = null;
    if (outlineLayerRef.current) outlineLayerRef.current.visible = true;

    try {
      const lv = await view.whenLayerView(newLayer);
      if (lv.updating) {
        await reactiveUtils.whenOnce(() => !lv.updating);
      }
    } catch { /* layer may have been removed by a rapid year change */ }
    // Remove the old layer now that the new one has rendered. Guard against a rapid
    // year change having already replaced pieLayerRef (the old layer would already be
    // orphaned from the map by the next showPieLayer call).
    if (oldLayer) view.map?.remove(oldLayer);
  };

  const hidePieLayer = () => {
    if (pieLayerRef.current) { view.map?.remove(pieLayerRef.current); pieLayerRef.current = null; }
    layer.visible = true;
    if (outlineLayerRef.current) outlineLayerRef.current.visible = false;
  };

  useEffect(() => {
    // Build once from the loaded polygon geometries — thin grey outlines only.
    const outline = new SimpleLineSymbol({ color: [110, 110, 110, 55], width: 0.4 });
    const fillSym = new SimpleFillSymbol({ color: [0, 0, 0, 0], outline });
    const graphics = [...graphicsByPostcode.values()].map(
      (g) => new ArcGraphic({ geometry: g.geometry, symbol: fillSym })
    );
    const gl = new GraphicsLayer({ graphics, listMode: "hide", visible: false });
    view.map?.add(gl, 0); // insert below all other layers
    outlineLayerRef.current = gl;
    return () => {
      view.map?.remove(gl);
      outlineLayerRef.current = null;
      // Restore the shared layer for the next view (it was hidden in pie mode).
      if (pieLayerRef.current) { view.map?.remove(pieLayerRef.current); pieLayerRef.current = null; }
      layer.visible = true;
      layer.featureReduction = null;
      (layer as any).definitionExpression = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    async function run() {
      try {
        const yearData = await getYearData(dataStore, year);
        if (cancelled) return;

        const { byPostcode } = computeDominantMake(dataStore.meta, yearData);

        // Write winning-make share into the DOMINANT_SHARE graphic attribute so
        // the field-based opacity visualVariable can read it without Arcade.
        for (const [pc, dm] of byPostcode) {
          const g = graphicsByPostcode.get(pc);
          if (g) g.attributes.DOMINANT_SHARE = dm.pcTotal > 0 ? dm.share : 0;
        }

        const breakdown = computeMakeBreakdown(dataStore.meta, yearData);
        breakdownRef.current = breakdown;
        for (const [pc, counts] of breakdown) {
          const g = graphicsByPostcode.get(pc);
          if (!g) continue;
          g.attributes.TOYOTA_COUNT  = counts.toyota;
          g.attributes.FORD_COUNT    = counts.ford;
          g.attributes.HOLDEN_COUNT  = counts.holden;
          g.attributes.MERC_COUNT    = counts.merc;
          g.attributes.HYUNDAI_COUNT = counts.hyundai;
          g.attributes.OTHER_COUNT   = counts.other;
          g.attributes.TOTAL_COUNT   = counts.total;
        }

        const { renderer, legend, strength } = buildDominantRenderer(
          byPostcode,
          new Set(graphicsByPostcode.keys())
        );

        // Apply the current display mode. pieMode is captured via closure from
        // the outer component scope; the effect re-runs on year change only.
        // In pie mode this REBUILDS the pie layer with the new year's counts, which is
        // the fix for B-005 (the cluster now reflects the selected year).
        if (pieMode) {
          showPieLayer();
        } else {
          hidePieLayer();
          layer.featureReduction = null;
          (layer as any).definitionExpression = "";
          layer.renderer = renderer;
          layer.popupTemplate = buildPopup(byPostcode, breakdown);
          dominantRendererRef.current = renderer;
        }
        setLegend(legend);
        setStrength(strength);
        setReady(true);
        setHasLoaded(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Instantly switch display mode when the user clicks the toggle. Does not re-run the
  // data pass — the count fields are already written from the last year load, so the pie
  // layer is built straight from them.
  useEffect(() => {
    if (!ready) return;
    if (pieMode) {
      showPieLayer();
    } else {
      hidePieLayer();
      layer.featureReduction = null;
      if (dominantRendererRef.current) layer.renderer = dominantRendererRef.current;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieMode]);

  return (
    <>
      {/* Context strip - Row 2 position */}
      <ControlStrip
        years={years}
        year={year}
        onYearChange={onYearChange}
        title="Dominant Make"
        note={pieMode
            ? "Top-5 make mix · pie size = registrations · click for breakdown"
            : "Colour = leading make · opacity = how strongly it leads"}
        error={error}
        busy={!ready && !error}
      />

      {/* Legend - bottom left, matching the other presets */}
      {hasLoaded && legend.length > 0 && (
        <MapCard
          title="Leading make"
          collapsible
          minWidth={200}
          maxWidth={230}
          footer={
            // Strength-of-lead ramp only meaningful in colour-map mode.
            strength && !pieMode ? (
              <>
                <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>
                  Strength of lead
                </div>
                <div style={{
                  height: 10, borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)",
                  background: `linear-gradient(to right,
                    rgba(60,60,60,${ALPHA_MIN}), rgba(60,60,60,${ALPHA_MAX}))`,
                }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span>Contested (~{Math.round(strength.loShare * 100)}%)</span>
                  <span>Decisive ({Math.round(strength.hiShare * 100)}%+)</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  Share = the leading make's portion of the postcode's total registrations.
                  Popups name the true winner even where it is outside the top 5.
                </div>
              </>
            ) : undefined
          }
        >
          {legend.map((item) => (
            <MapCardRow
              key={item.label}
              color={item.color}
              label={item.label}
              count={`${item.wins} postcode${item.wins !== 1 ? "s" : ""}`}
            />
          ))}
          {/* Mode toggle: Predominance (choropleth) vs Pie charts (cluster donuts) */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
            <SegmentedControl
              value={pieMode ? "pies" : "map"}
              options={[
                { value: "map",  label: "Colour map" },
                { value: "pies", label: "Pie charts" },
              ] as const}
              onChange={(v) => setPieMode(v === "pies")}
              ariaLabel="Display mode"
              fill
            />
          </div>
        </MapCard>
      )}
    </>
  );
}

/**
 * Popup for colour-map mode. Uses the same percentage-table layout as the pie popup
 * so the two modes feel consistent. Reads from the precomputed breakdown map (not from
 * graphic attributes) since the colour-map mode runs on the shared polygon layer whose
 * fields are only the top-5 + DOMINANT_SHARE.
 */
function buildPopup(
  byPostcode: Map<string, DominantMake>,
  breakdownMap: Map<string, { toyota: number; ford: number; holden: number; merc: number; hyundai: number; other: number; total: number }>,
) {
  return {
    title: "Postcode {POSTCODE}",
    content: (feature: { graphic: Graphic }) => {
      const pc = feature.graphic.attributes.POSTCODE as string;
      const dm = byPostcode.get(pc);
      const bd = breakdownMap.get(pc);
      if (!dm || dm.pcTotal <= 0) {
        return `<div style="font-family:var(--font-sans),-apple-system,sans-serif;font-size:13px">No registration data for this postcode.</div>`;
      }
      const attrs: Record<string, number> = {
        toyota: bd?.toyota ?? 0, ford: bd?.ford ?? 0, holden: bd?.holden ?? 0,
        merc: bd?.merc ?? 0, hyundai: bd?.hyundai ?? 0,
      };
      return buildMakePopupContent(attrs, "", `${dm.pcTotal.toLocaleString()} total registrations`);
    },
  };
}


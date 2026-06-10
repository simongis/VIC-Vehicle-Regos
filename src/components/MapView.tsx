import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import ArcGISMapView from "@arcgis/core/views/MapView";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import ArcGraphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import Home from "@arcgis/core/widgets/Home";
import "@arcgis/core/assets/esri/themes/light/main.css";

interface Props {
  onReady: (view: ArcGISMapView) => void;
  topOffset?: number;
}

const VICTORIA_EXTENT = {
  xmin: 140.8, ymin: -39.3, xmax: 150.1, ymax: -33.9,
  spatialReference: { wkid: 4326 },
};

// Two-stage label reveal. The SDK's label deconfliction is broken for
// client-side (collection-source) FeatureLayers (known Esri issue), so we
// manage density ourselves: large localities (rural / outer metro, tier 1)
// label from ~z10; small inner-metro suburbs (tier 2 - where the overlap
// soup was) only from ~z12, where they have the screen room to fit.
const TIER1_MIN_SCALE = 300_000; // ~z10+
const TIER2_MIN_SCALE = 75_000;  // ~z12+

function labelLayerFor(graphics: ArcGraphic[], minScale: number): FeatureLayer {
  return new FeatureLayer({
    source: graphics,
    objectIdField: "OBJECTID",
    geometryType: "point",
    spatialReference: { wkid: 4326 },
    fields: [
      { name: "OBJECTID", type: "oid" },
      { name: "NAME", type: "string" },
    ],
    // Invisible point: the layer exists purely for labels.
    renderer: new SimpleRenderer({
      symbol: new SimpleMarkerSymbol({ size: 0, color: [0, 0, 0, 0] }),
    }),
    labelingInfo: [
      {
        labelExpressionInfo: { expression: "$feature.NAME" },
        symbol: {
          type: "text",
          color: [100, 100, 100, 1],
          haloColor: [255, 255, 255, 0.9],
          haloSize: 1.3,
          // NOTE: 2D map labels render in a WebGL worker using Esri-hosted
          // glyph atlases (static.arcgis.com/fonts) - CSS/self-hosted fonts
          // like VIC are NOT available here (the request 404s, and the failed
          // glyph metrics drew every label as overlapping soup). Noto Sans
          // italic is hosted and matches the basemap label look.
          font: {
            family: "Noto Sans",
            size: 9,
            weight: "normal",
            style: "italic",
          },
        } as any,
        minScale,
        maxScale: 0,
        labelPlacement: "above-center",
      } as any,
    ],
    labelsVisible: true,
    popupEnabled: false,
    legendEnabled: false,
    listMode: "hide",
  });
}

async function buildLocalityLabelLayers(): Promise<FeatureLayer[]> {
  const url = `${import.meta.env.BASE_URL}data/localities.json`;
  const raw: [string, number, number, number][] = await fetch(url).then((r) => r.json());

  const tier1: ArcGraphic[] = [];
  const tier2: ArcGraphic[] = [];
  raw.forEach(([name, lon, lat, tier], i) => {
    const g = new ArcGraphic({
      geometry: new Point({ longitude: lon, latitude: lat }),
      attributes: { OBJECTID: i + 1, NAME: name },
    });
    (tier === 1 ? tier1 : tier2).push(g);
  });

  return [
    labelLayerFor(tier1, TIER1_MIN_SCALE),
    labelLayerFor(tier2, TIER2_MIN_SCALE),
  ];
}

export function MapView({ onReady, topOffset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ArcGISMapView | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const map = new Map({
      basemap: "gray-vector",
    });

    const view = new ArcGISMapView({
      container: containerRef.current,
      map,
      extent: VICTORIA_EXTENT,
      constraints: { rotationEnabled: false },
      ui: { components: ["zoom"] },
    });

    view.when(() => {
      if (view.popup) {
        view.popup.dockEnabled = false;
        view.popup.visibleElements = {
          ...view.popup.visibleElements,
          actionBar: false,
          featureNavigation: false,
        };
      }

      const home = new Home({ view });
      view.ui.add(home, { position: "top-left", index: 0 });

      // Permanently hide all basemap reference labels. Replaced by the
      // static Vicmap locality label layer below.
      const refs = map.basemap?.referenceLayers;
      refs?.forEach((l) => { l.visible = false; });

      // Load the static centroid label layers (2,973 points, ~30KB gzipped,
      // pre-title-cased, no external service dependency at runtime).
      buildLocalityLabelLayers().then((layers) => {
        for (const layer of layers) map.add(layer);
      });

      // Dev-only handle for Playwright tests (zoom/centre the view directly).
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__view = view;
      }

      onReady(view);
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: topOffset ?? "var(--filter-panel-height)",
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  );
}

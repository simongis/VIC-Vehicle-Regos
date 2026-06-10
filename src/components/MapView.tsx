import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import ArcGISMapView from "@arcgis/core/views/MapView";
import Home from "@arcgis/core/widgets/Home";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import "@arcgis/core/assets/esri/themes/light/main.css";

interface Props {
  onReady: (view: ArcGISMapView) => void;
  topOffset?: number;
}

// Victoria's geographic bounding box (WGS84). Used as the initial map extent so
// the state fills the view on load (and as the Home/full-extent target).
const VICTORIA_EXTENT = {
  xmin: 140.8, ymin: -39.3, xmax: 150.1, ymax: -33.9,
  spatialReference: { wkid: 4326 },
};

// Basemap labels (the reference layer) are clutter at state scale. Hide them when
// zoomed out, reveal them ~2-3 LODs in so place names appear as the user drills in.
const LABEL_ZOOM_THRESHOLD = 9;

export function MapView({ onReady, topOffset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ArcGISMapView | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const map = new Map({
      // "gray-vector" is the anonymous-access light-gray basemap (no API key required).
      // Upgrade to "arcgis/light-gray" if you configure esriConfig.apiKey in production.
      basemap: "gray-vector",
    });

    const view = new ArcGISMapView({
      container: containerRef.current,
      map,
      extent: VICTORIA_EXTENT,
      // Rotation is disabled on every view: a state-level choropleth is read
      // north-up, and a stray right-drag/tilt only disorients. This blocks the
      // right-drag and keyboard rotation gestures. The compass is dropped from
      // the UI too, since with rotation locked it can never do anything.
      constraints: { rotationEnabled: false },
      // "attribution" is no longer a UI component in SDK v5 - it is part of the View
      // itself and is always shown. Only "zoom" remains as a managed component.
      ui: { components: ["zoom"] },
    });

    view.when(() => {
      // Strip popup chrome: no dock, no zoom-to action bar, no cluster browse-features.
      // Reclaims header space and keeps popups clean across all views.
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

      // Toggle basemap labels on zoom. The reference layer holds the place labels;
      // if the basemap fails to load (e.g. offline) the collection is empty and
      // this is a harmless no-op.
      const applyLabelVisibility = (zoom: number) => {
        const refs = map.basemap?.referenceLayers;
        refs?.forEach((l) => { l.visible = zoom >= LABEL_ZOOM_THRESHOLD; });
      };
      applyLabelVisibility(view.zoom);
      reactiveUtils.watch(() => view.zoom, applyLabelVisibility);

      onReady(view);
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // onReady is stable (useCallback in App), but exhaustive-deps wants it listed.
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

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { ServerDTO } from "@/lib/types";
import { ASSET_TYPE_LABEL, STATUS_LABEL } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  warning: "#f59e0b",
  offline: "#ef4444",
  maintenance: "#a855f7",
};

const TYPE_GLYPH: Record<string, string> = {
  physical: "▣",
  virtual: "☁",
};

function pinIcon(server: ServerDTO, selected: boolean) {
  const color = STATUS_COLOR[server.status] ?? "#8b5cf6";
  return L.divIcon({
    className: "srv-marker",
    html: `<div class="srv-pin${selected ? " srv-pin-selected" : ""}" style="background:${color}"><span>${TYPE_GLYPH[server.assetType] ?? "▣"}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
  });
}

const clusterIcon = (cluster: L.MarkerCluster) => {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 50 ? 40 : 46;
  return L.divIcon({
    className: "cluster-marker",
    html: `<div class="cluster-pin" style="width:${size}px;height:${size}px">${count}</div>`,
    iconSize: L.point(size, size, true),
  });
};

function FlyToSelection({
  servers,
  selectedId,
}: {
  servers: ServerDTO[];
  selectedId: number | null;
}) {
  const map = useMap();
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (selectedId === null || selectedId === lastId.current) return;
    lastId.current = selectedId;
    const target = servers.find((s) => s.id === selectedId);
    if (!target) return;
    map.flyTo(
      [target.latitude, target.longitude],
      Math.max(map.getZoom(), 11),
      {
        duration: 0.8,
      },
    );
  }, [map, selectedId, servers]);

  useEffect(() => {
    lastId.current = null;
  }, [servers]);

  return null;
}

function ClusterLayer({
  servers,
  selectedId,
  onSelect,
}: {
  servers: ServerDTO[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const map = useMap();
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const serverKey = `${servers.length}:${selectedId ?? "none"}:${servers
    .map((s) => `${s.id}@${s.latitude},${s.longitude}`)
    .join(";")}`;

  useEffect(() => {
    const group = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
    });
    servers.forEach((s) => {
      const marker = L.marker([s.latitude, s.longitude], {
        icon: pinIcon(s, s.id === selectedId),
        title: s.hostname,
      });
      marker.bindTooltip(
        `<strong>${s.hostname}</strong><br/>${s.organizationName}`,
        { direction: "top", offset: [0, -26], opacity: 0.96 },
      );
      marker.on("click", () => selectRef.current(s.id));
      marker.bindPopup(
        `<div style="min-width:190px">
           <div style="font-weight:600;font-size:13px">${s.hostname}</div>
           <div class="map-popup-org">${s.organizationName}</div>
           <div style="font-size:11.5px;line-height:1.6">
             <div>Type: <b>${ASSET_TYPE_LABEL[s.assetType]}</b></div>
             <div>Status: <b style="color:${STATUS_COLOR[s.status] ?? "#8b5cf6"}">${STATUS_LABEL[s.status] ?? s.status}</b></div>
             ${s.project ? `<div>Project: <b>${s.project}</b></div>` : ""}
             ${s.tag ? `<div>Tag: <b>${s.tag}</b></div>` : ""}
             ${s.city || s.country ? `<div>Site: ${[s.city, s.country].filter(Boolean).join(", ")}</div>` : ""}
             <div class="map-popup-coords">${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</div>
           </div>
         </div>`,
        { closeButton: true, autoPan: true },
      );
      group.addLayer(marker);
    });

    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      group.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, serverKey]);

  return null;
}

export default function ServerMap({
  servers,
  selectedId,
  onSelect,
  center = [25, 10],
}: {
  servers: ServerDTO[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  center?: [number, number];
}) {
  return (
    <MapContainer
      center={center}
      zoom={3}
      minZoom={2}
      maxZoom={18}
      worldCopyJump
      zoomControl
      className="h-full w-full"
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ClusterLayer
        servers={servers}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <FlyToSelection servers={servers} selectedId={selectedId} />
    </MapContainer>
  );
}

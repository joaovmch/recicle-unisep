/**
 * Distância entre duas coordenadas, para a área de cobertura.
 *
 * É distância em linha reta (haversine), não de rota — é o mesmo critério do raio que a
 * cooperativa configura ("em linha reta a partir do galpão"), então bate com o círculo
 * desenhado no mapa.
 */

const RAIO_DA_TERRA_KM = 6371;

export interface Ponto {
  latitude: number;
  longitude: number;
}

function emRadianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

export function distanciaKm(de: Ponto, ate: Ponto): number {
  const deltaLat = emRadianos(ate.latitude - de.latitude);
  const deltaLon = emRadianos(ate.longitude - de.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(emRadianos(de.latitude)) * Math.cos(emRadianos(ate.latitude)) * Math.sin(deltaLon / 2) ** 2;

  return RAIO_DA_TERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

-- ===================== MAPA (Leaflet + OpenStreetMap) =====================
-- As telas de mapa deixaram de ser ilustrativas: os pinos agora saem de coordenadas
-- de verdade. `ecopontos` já tinha latitude/longitude; faltava guardar as do galpão
-- da cooperativa e as dos bairros atendidos, senão toda abertura da tela de Área de
-- cobertura teria que geocodificar o mesmo endereço de novo no Nominatim.

alter table public.cooperativas
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

alter table public.bairros_atendidos
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

-- Índice para a busca de ecopontos por região no mapa (e para não varrer a tabela
-- inteira quando a lista crescer).
create index if not exists ecopontos_coordenadas_idx
  on public.ecopontos (latitude, longitude)
  where ativo and latitude is not null and longitude is not null;

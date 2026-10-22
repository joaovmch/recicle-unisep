/**
 * Endereço -> coordenada, para os mapas.
 *
 * Quem fala com o serviço de mapas (Nominatim/OpenStreetMap) é o servidor, em
 * `/api/geocodificar`: é lá que ficam o cache, a fila de um pedido por segundo que a
 * política de uso exige e a sequência de tentativas (endereço -> rua -> bairro -> cidade).
 * Aqui é só a chamada, e ela nunca lança — endereço que não dá para localizar vira `null`
 * e a tela segue mostrando o resto.
 */

/** Quão perto do endereço pedido o ponto está de fato. */
export type PrecisaoCoordenada = 'endereco' | 'rua' | 'bairro' | 'cidade';

export interface Coordenada {
  latitude: number;
  longitude: number;
  precisao: PrecisaoCoordenada;
}

export interface EnderecoBusca {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

const PRECISOES: PrecisaoCoordenada[] = ['endereco', 'rua', 'bairro', 'cidade'];

/** Texto curto para a tela avisar que o pino não está exatamente na porta do galpão. */
export function descreverPrecisao(precisao: PrecisaoCoordenada): string {
  switch (precisao) {
    case 'endereco':
      return 'Localizado no número informado.';
    case 'rua':
      return 'O número não está mapeado no OpenStreetMap — o pino ficou na rua informada.';
    case 'bairro':
      return 'A rua não está mapeada no OpenStreetMap — o pino ficou no centro do bairro.';
    case 'cidade':
      return 'Nem a rua nem o bairro estão mapeados no OpenStreetMap — o pino ficou no centro da cidade.';
  }
}

export async function geocodificar(endereco: EnderecoBusca): Promise<Coordenada | null> {
  if (!endereco.cidade?.trim()) return null;

  try {
    const resposta = await fetch('/api/geocodificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rua: endereco.rua ?? '',
        numero: endereco.numero ?? '',
        bairro: endereco.bairro ?? '',
        cidade: endereco.cidade ?? '',
        uf: endereco.uf ?? '',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (!Number.isFinite(dados?.latitude) || !Number.isFinite(dados?.longitude)) return null;

    return {
      latitude: Number(dados.latitude),
      longitude: Number(dados.longitude),
      precisao: PRECISOES.includes(dados?.precisao) ? dados.precisao : 'cidade',
    };
  } catch {
    return null;
  }
}

# Conferência: projeto × Documento de Requisitos

Comparação entre o `Documento_REQUISITOS_Re-cicle.docx` e o código/banco atuais.
Legenda: ✅ atende · 🟡 parcial · ❌ falta · ⛔ depende de serviço externo.

## 6.1 Autenticação
| US | Situação | O que falta |
|---|---|---|
| US01 Criar conta | 🟡 | Registrar data/versão dos termos aceitos; bloquear coleta em casa sem e-mail confirmado; aviso "reenviar confirmação" (2 min) no painel. |
| US02 Login | 🟡 | Bloqueio por 5 tentativas / 15 min; mensagem "Acesso desativado" para conta suspensa; sessão de 8 h × 30 dias com "Continuar conectado". |
| US03 Recuperar senha | 🟡 | Recuperar pelo CNPJ; botão "Reenviar" liberado após 1 min; aviso por e-mail após a troca. |

## 6.2 Cadastro da cooperativa
| US | Situação | O que falta |
|---|---|---|
| US04 Dados | 🟡 | Razão social × nome exibido; associados 1–999; "Ainda não tem CNPJ?"; link de retomada do rascunho por e-mail. |
| US05 Documentos | 🟡 | Conferir regras de obrigatoriedade (licença + cartão CNPJ) e "Licença vencida". |
| US06 Operação | 🟡 | Coletas **por período** (manhã/tarde), valor base e acréscimos da coleta. |
| US07 Revisão | 🟡 | Duas declarações (veracidade + termos de parceria) com data/versão. |
| US08 Conferência (admin) | 🟡 | CNPJ/endereço conferem, órgão consultado, atividades autorizadas, tipos bloqueados; motivo 20–500; suspender licença vencida. |

## 6.3 Painel da cooperativa
| US | Situação | O que falta |
|---|---|---|
| US09 Visão geral | 🟡 | Visão do papel Triagem; rota por coletor. |
| US10 Tipos de resíduo | 🟡 | "Desfazer"; estimativa de pedidos ±; aviso do óleo. |
| US11 Área de cobertura | 🟡 | Pedidos perdidos por distância com raio sugerido; "Desfazer". |
| US12 Equipe e veículos | 🟡 | Convite por e-mail (48 h) e e-mail único; bloquear remoção do responsável legal; troca de coletor. |
| US13 Documentos | 🟡 | Conferir com a US08. |
| US14 Relatórios | 🟡 | Nome do solicitante só com autorização; envio por e-mail; guarda 12 meses. |

## 6.4 Conta do morador
| US | Situação | O que falta |
|---|---|---|
| US15 Dados e endereços | 🟡 | **CPF** (máscara, dígitos, único, oculto, não editável); limite de 5 endereços; bloquear remoção de endereço em uso; autorização de nome em relatórios; foto. |
| US16 Notificações | ❌ | Tabela aviso × canal (com o aviso obrigatório travado), horário de silêncio, "Desfazer". Hoje só há 3 chaves gerais. |
| US17 Segurança | 🟡 | Exigir senha atual (5 erros = 15 min); último acesso; "Encerrar as outras"; "Reportar acesso indevido". |
| US18 Baixar meus dados | ❌ | Tela inteira (grupos, formato ZIP/JSON, 1 pedido a cada 7 dias). |
| US19 Excluir conta | 🟡 | Cancelar solicitações em andamento e invalidar resgates; anonimizar o que a lei exige guardar. |

## 6.5 Descarte orientado
| US | Situação | O que falta |
|---|---|---|
| US20 Conversa com a IA | 🟡 | Envio de foto (até 3); limite de 30 mensagens/descarte e 100/dia; resíduo perigoso sem opções de destino; mensagem de falha + mapa; perguntar se abre novo descarte. |
| US21 Mapa | 🟡 | Filtros (tipo de local, resíduo, raio, CEP), "Aberto agora", cooperativas no mapa, "Nenhum local encontrado". |
| US22 Página da cooperativa | ❌ | Tela inteira (selo, licença, avaliações, como chegar, ligar). |
| US23 Entrega em ecoponto | 🟡 | Código de entrega, prazo de 7 dias e expiração automática, "Prefiro coleta em casa". |
| US24 Coleta em casa | 🟡 | Tela "Solicitar coleta" com endereço + janelas dos próximos 7 dias com vagas, recado, cooperativa sugerida (RN18/RN82), limites (3 em andamento, suspensão por cancelamentos), exigir CPF/telefone/e-mail confirmado. Hoje cria direto com "A combinar". |

## 6.6 Coletas da cooperativa
| US | Situação | O que falta |
|---|---|---|
| US25 Solicitações | 🟡 | Ocultar endereço/telefone antes do aceite; destaque de prazo (2 h); coletas já feitas no endereço. |
| US26 Conversa (leitura) | ✅/🟡 | Conferir corte das mensagens após a solicitação. |
| US27 Aceitar | 🟡 | Validar capacidade do veículo; vaga da janela; prazo de 24 h. |
| US28 Sugerir outra data | ❌ | Tela e fluxo inteiros. |
| US29 Recusar | 🟡 | Alternativas por motivo (2 viagens, valor maior, "só esta semana"); repasse a outra cooperativa. |
| US30 Confirmar recebimento | 🟡 | Bloqueio após 5 códigos errados; soma da separação = total (±0,1); rascunho; bônus de separação. |
| US31 Problema na coleta | 🟡 | Motivos do documento e campos específicos de cada um; protocolo; 2ª ausência encerra. |

## 6.7 Solicitações do morador
| US | Situação | O que falta |
|---|---|---|
| US32 Painel | 🟡 | Conferir "Já dá para resgatar" e impacto por material. |
| US33 Minhas solicitações | 🟡 | Abas com contagem; exportar histórico (CSV/PDF). |
| US34 Detalhes e código | 🟡 | Compartilhar o código; editar recado; histórico de eventos. |
| US35 Remarcar | 🟡 | Janelas com vagas; regra das 2 h; "Adicionar à agenda". |
| US36 Responder proposta | ❌ | Depende da US28. |
| US37 Cancelar | 🟡 | Motivos do documento; contagem/suspensão; "Consegui levar ao ecoponto" não conta. |
| US38 Avaliação | ❌ | Estrelas, pontos positivos, comentário, edição por 7 dias. |
| US39 Comprovante | 🟡 | PDF, envio por e-mail, **página pública de verificação**. |

## 6.8 Pontos e benefícios
| US | Situação | O que falta |
|---|---|---|
| US40 Meus pontos | 🟡 | Pontos da coleta em casa 3,75/kg e bônus de separação no crédito. |
| US41 Catálogo (admin) | ❌ | Tela de administração; estoque mensal; validade do código; baixa do código. |
| US42 Resgatar | 🟡 | QR, validade, cancelar em 24 h, vencimento. |
| US43 Indicar parceiro | ❌ | Tela inteira. |

## 6.9 Área pública e suporte
| US | Situação | O que falta |
|---|---|---|
| US44 Páginas públicas | 🟡 | "Para cooperativas", "Sobre o projeto", "Privacidade e termos" (com versão e índice); aceite de nova versão dos termos. |
| US45 Falar com a equipe | ❌ | Formulário com protocolo. |
| US46 Reclamação | ❌ | Formulário com protocolo e anexo. |
| US47 Ocorrências (admin) | ❌ | Fila de ocorrências e decisões. |

## Regras gerais e não funcionais
- RG05 / RNF04 — log de auditoria: ❌
- RG08 / RNF10 — notificações por e-mail e WhatsApp: ⛔ (precisa de um serviço de envio, ex.: Resend e API do WhatsApp). Dá para registrar os avisos no app.
- Rotinas por horário (24 h sem resposta, 7 dias para entregar, lembrete das 18:00, estoque do dia 1): ❌ — dá para fazer com `pg_cron` no Supabase.
- RN05 — validade do token de 8 h: ⛔ configuração do painel do Supabase (Auth → Sessions).

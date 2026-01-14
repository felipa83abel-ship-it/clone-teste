# Plano de Refatoração Arquitetural: Padrão Baseado em Eventos para Módulos STT

## Data
11 de janeiro de 2026

## Objetivo
Refatorar a arquitetura do projeto para um padrão consistente baseado em eventos, desacoplando módulos de transcrição (`modelo.js`) do `renderer.js`. Isso facilita manutenção, testes e adição de novos modelos (ex.: Whisper, Vosk). O foco inicial é no Deepgram, mas preparado para escalar.

## Análise Atual do Código
- **deepgram-transcribe.js**: Módulo separado para Deepgram. Chama `handleCurrentQuestion` diretamente para output, `handleSpeech` para input. Emite eventos UI (`onUpdateInterim`, `onClearInterim`) via `globalThis.RendererAPI.emitUIChange`.
- **renderer.js**: Contém estado global (`currentQuestion`), lógica compartilhada (`handleCurrentQuestion`, `handleSpeech`), e emite eventos para `config-manager.js` (`onCurrentQuestionUpdate`).
- **config-manager.js**: Escuta eventos do renderer e atualiza DOM.
- **Outros modelos**: 
  - `transcribe-deepgram.js`: Parece duplicado do deepgram-transcribe.js (verificar se é usado).
  - `vosk-server.py`: Servidor Python para Vosk (não integrado ainda).
  - Menções a Whisper em renderer.js (ex.: `startAudioWhisper`), mas sem módulo separado.
- **Problemas**: Acoplamento (chamadas diretas), inconsistência (eventos + funções), dificuldade para adicionar modelos.

## Padrão Proposto
- **renderer.js**: Orquestrador. Gerencia estado e regras. Escuta eventos dos modelos via `EventTarget` global.
- **config-manager.js**: Apenas DOM.
- **modelo.js**: Lógica específica. Emite eventos `'transcription'` com payload padrão: `{ model: string, source: 'input'|'output', text: string, isFinal: boolean, confidence?: number, timestamp: number }`.
- **Comunicação**: `window.transcriptionEvents = new EventTarget();` para desacoplamento.

## Arquivos Afetados
- `renderer.js`: Adicionar EventTarget, listener, ajustar lógica.
- `deepgram-transcribe.js`: Refatorar para emitir eventos em vez de chamar funções.
- Novos arquivos: `whisper-transcribe.js`, `vosk-transcribe.js` (separar lógica existente).
- Possivelmente remover duplicatas (ex.: `transcribe-deepgram.js`).

## Backups
- Criar backups antes de editar:
  - `renderer.js.bak`
  - `deepgram-transcribe.js.bak`
- Usar git: Commitar estado atual com mensagem "Antes da refatoração arquitetural".

## Passos Detalhados

### 1. Preparação
- Criar backups dos arquivos.
- Commitar no git.

### 2. Configurar EventTarget Global em renderer.js
- Adicionar no topo: `window.transcriptionEvents = new EventTarget();`

### 3. Adicionar Listener em renderer.js
- Adicionar listener para `'transcription'` que chama `handleCurrentQuestion` ou `handleSpeech` baseado em `source` e `model`.

### 4. Refatorar deepgram-transcribe.js
- Remover chamadas diretas a `handleCurrentQuestion` e `handleSpeech`.
- Em `handleFinalDeepgramMessage` e `handleInterimDeepgramMessage`, emitir `'transcription'` via `window.transcriptionEvents.dispatchEvent`.
- Manter emissões UI (`onUpdateInterim`, `onClearInterim`) para compatibilidade.

### 5. Separar Outros Modelos
- Criar `whisper-transcribe.js`: Extrair lógica de Whisper de renderer.js, seguindo padrão (emitir `'transcription'`).
- Criar `vosk-transcribe.js`: Integrar vosk-server.py ou lógica existente, emitir eventos.
- Atualizar renderer.js para usar os novos módulos em vez de código inline.

### 6. Limpeza
- Remover código duplicado (ex.: `transcribe-deepgram.js` se confirmado duplicado).
- Remover funções globais não usadas.
- Ajustar imports/exports.

### 7. Testes
- Executar `npm start`, testar captura Deepgram, verificar logs de eventos.
- Testar outros modelos se implementados.
- Verificar se UI atualiza corretamente (CURRENT, transcrições).

## Riscos e Considerações
- Quebrar funcionalidades existentes: Testar incrementalmente.
- Performance: Eventos são leves, mas monitorar.
- Compatibilidade: Manter eventos antigos temporariamente.
- Extensão: Novos modelos seguem o mesmo padrão sem mudanças no renderer.

## Status
Pronto para execução. Após implementar, validar e commitar.
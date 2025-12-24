# 🧪 Guia de Testes - AskMe

> Testes manuais completos para validação de todas as funcionalidades

---

## 📋 Índice

- [Preparação para Testes](#preparação-para-testes)
- [Testes de API e Modelos](#testes-de-api-e-modelos)
- [Testes de Áudio](#testes-de-áudio)
- [Testes de Transcrição](#testes-de-transcrição)
- [Testes de Perguntas e Respostas](#testes-de-perguntas-e-respostas)
- [Testes de Interface](#testes-de-interface)
- [Testes de Configurações](#testes-de-configurações)
- [Testes de Performance](#testes-de-performance)
- [Checklist Final](#checklist-final)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Preparação para Testes

### Requisitos Mínimos
```bash
✅ Node.js 18+ instalado
✅ npm 8+ instalado
✅ Dependências instaladas (npm install)
✅ API key OpenAI válida
✅ Microfone funcional
✅ Permissões de áudio concedidas
```

### Setup Inicial
```bash
# 1. Clone e instale
git clone https://github.com/seu-usuario/askme.git
cd askme
npm install

# 2. Execute em modo desenvolvimento
npm start

# 3. Abra DevTools (Ctrl+Shift+I)
```

### Dados de Teste
```
API Key válida: sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API Key inválida: sk-invalid-123
Chave curta: sk-abc (deve rejeitar, < 10 caracteres)
```

---

## 🔑 Testes de API e Modelos

### Teste 1: Validação de Modelo Ativo

**Objetivo:** Confirmar que não consegue iniciar escuta sem modelo ativo

**Pré-condições:**
- Aplicação aberta
- Nenhum modelo ativo

**Passos:**
1. 🏠 Ir para aba **Home**
2. 👀 Observar botão "Começar a Ouvir"
3. ⏯️ Clicar no botão
4. 👀 Observar mensagem de status

**Resultado Esperado:**
```
✅ Body recebe classe "dark"
✅ Cores mudam:
    Fundo: #0f172a (escuro)
    Texto: #e5e7eb (claro)
    Bordas: rgba(255,255,255,0.18)
✅ Alteração persistida em localStorage
✅ Ao desativar, volta para light theme
```

**Console esperado:**
```javascript
🌙 Dark mode: true
🌙 Dark mode: false
```

---

### Teste 28: Controle de Opacidade

**Objetivo:** Validar slider de opacidade do overlay

**Passos:**
1. 👀 Observar **slider de opacidade** no topo (ao lado do badge mock)
2. 🎚️ Mover slider para **0.3** (mais transparente)
3. 👀 Observar fundo da aplicação
4. 🎚️ Mover slider para **1.0** (opaco)
5. 👀 Observar mudança
6. 🔄 Reabrir aplicação
7. 👀 Confirmar que valor persiste

**Resultado Esperado:**
```
Passo 2: Aplicação fica mais transparente (30%)
Passo 4: Aplicação fica opaca (100%)
Passo 6-7: Slider restaura último valor salvo
TopBar nunca fica menos que 75% de opacidade
```

**Console esperado:**
```javascript
🎚️ Opacity change | app: 0.3 | topBar: 0.75
🎚️ Opacity change | app: 1.0 | topBar: 1.0
```

---

### Teste 29: Menu Lateral - Expansão

**Objetivo:** Validar animação de hover no menu

**Passos:**
1. 👀 Observar **menu lateral** (largura inicial: 60px)
2. 🖱️ **Passar mouse** sobre o menu (qualquer parte)
3. 👀 Observar expansão
4. ⏳ Aguardar 1 segundo
5. 🖱️ **Remover mouse** do menu
6. 👀 Observar retração

**Resultado Esperado:**
```
Passo 2: Menu expande para 220px
Passo 3: Textos dos itens aparecem (fade in)
Passo 6: Menu retrai para 60px
         Textos desaparecem (fade out)
Transição suave (0.3s cubic-bezier)
```

---

### Teste 30: Drag Handle (Mover Janela)

**Objetivo:** Validar arrastar janela pelo handle

**Passos:**
1. 👀 Localizar **"Drag Handle"** no topo do menu lateral (ícone `open_with`)
2. 🖱️ **Passar mouse** sobre o handle
3. 👀 Observar cursor
4. 🖱️ **Clicar e arrastar** o handle
5. 👀 Observar janela mover
6. 🖱️ **Soltar** mouse
7. 👀 Confirmar posição final

**Resultado Esperado:**
```
Passo 2: Cursor muda para "grab"
Passo 4: Cursor muda para "grabbing"
         Handle destaca (background ativo)
Passo 5: Janela move suavemente (throttled 16ms)
Passo 6: Handle volta ao normal
```

**Console esperado:**
```javascript
🪟 Drag iniciado (pointerdown)
🪟 Drag finalizado (pointerup)
MOVE_WINDOW_TO { x: 500, y: 300 }
```

---

### Teste 31: Click-through (Passar Cliques)

**Objetivo:** Validar modo "passar cliques através da janela"

**Passos:**
1. 👀 Observar **botão "Click-through"** no menu lateral (ícone `swipe`)
2. 🖱️ Clicar no botão
3. 👀 Observar opacidade do botão (fica 0.5)
4. 🖱️ Tentar clicar **fora do menu lateral** (no fundo transparente)
5. 👀 Observar se clique passa para janela atrás
6. 🖱️ Clicar no botão novamente (desativar)
7. 👀 Confirmar opacidade volta para 1.0

**Resultado Esperado:**
```
Passo 2: Botão fica semitransparente (opacity: 0.5)
         Tooltip: "Click-through ATIVO"
Passo 4: Clique PASSA para janela atrás da aplicação
Passo 6: Botão volta para opaco (opacity: 1.0)
         Tooltip: "Click-through INATIVO"
```

**Console esperado:**
```javascript
🖱️ Click-through: ATIVADO
🖱️ Click-through: DESATIVADO
```

---

### Teste 32: Tabs - Navegação

**Objetivo:** Validar navegação por tabs em cada seção

**Passos:**
1. ⚙️ Ir para **"API e Modelos"**
2. 👀 Observar tabs: **OpenAI** | **Google** | **OpenRouter** | **Custom API**
3. 🖱️ Clicar em **"Google"**
4. 👀 Observar mudança visual
5. 🖱️ Clicar em **"OpenRouter"**
6. 👀 Observar conteúdo

**Resultado Esperado:**
```
Passo 3: Tab "Google" fica ativa (borda inferior azul)
         Conteúdo muda para formulário Google
Passo 5: Tab "OpenRouter" fica ativa
         Conteúdo muda para formulário OpenRouter
Transição suave (fadeIn 0.3s)
```

---

### Teste 33: Seções - Navegação

**Objetivo:** Validar navegação entre seções principais

**Passos:**
1. 🖱️ Clicar em **"Home"** no menu lateral
2. 👀 Observar conteúdo (transcrição + perguntas)
3. 🖱️ Clicar em **"API e Modelos"**
4. 👀 Observar mudança
5. 🖱️ Clicar em **"Áudio e Tela"**
6. 👀 Observar conteúdo
7. 🖱️ Clicar em **"Privacidade"**
8. 🖱️ Clicar em **"Outros"**
9. 🖱️ Clicar em **"Info"** (versão)

**Resultado Esperado:**
```
Todas as seções carregam corretamente
Item do menu destaca (classe "active")
Borda lateral azul no item ativo
Transição fadeIn ao mudar de seção
```

---

### Teste 34: Botão Sair

**Objetivo:** Validar fechamento da aplicação

**Passos:**
1. 👀 Observar **botão "Sair"** no rodapé do menu (vermelho)
2. 🖱️ Clicar no botão
3. 👀 Observar aplicação fechar

**Resultado Esperado:**
```
✅ Aplicação fecha imediatamente
❌ Não pede confirmação (pode adicionar no futuro)
```

**Console esperado:**
```javascript
❌ BotÃ£o Fechar clicado
❌ APP_CLOSE recebido — encerrando aplicação
```

---

## ⚙️ Testes de Configurações

### Teste 35: Salvar Configurações - Modelos de IA

**Objetivo:** Validar salvamento de modelos personalizados

**Passos:**
1. ⚙️ Ir para **"API e Modelos"** → **"OpenAI"**
2. ✏️ Mudar **"Modelo de Transcrição"** para: `whisper-large-v3`
3. ✏️ Mudar **"Modelo de Resposta"** para: `gpt-4`
4. 💾 Clicar **"Salvar Configurações"**
5. 🔄 Fechar e reabrir aplicação
6. ⚙️ Voltar para **"OpenAI"**
7. 👀 Observar valores dos campos

**Resultado Esperado:**
```
Passo 4: Mensagem "Configurações salvas com sucesso"
Passo 7: Campos mantêm valores salvos:
         Transcrição: whisper-large-v3
         Resposta: gpt-4
```

---

### Teste 36: Exportar/Importar Configurações

**Objetivo:** Validar backup e restauração de configs

**Nota:** *Esta funcionalidade está comentada no HTML atual, mas pode ser reativada*

**Passos:**
1. ⚙️ Ir para **"Outros"**
2. 💾 Clicar **"Exportar Configurações"**
3. 👀 Confirmar download de `Askme-config.json`
4. ✏️ Mudar algumas configurações (tema, opacidade, etc)
5. 📁 Clicar **"Importar Configurações"**
6. 📂 Selecionar arquivo `Askme-config.json`
7. 👀 Observar reload da página
8. 👀 Confirmar que configurações foram restauradas

**Resultado Esperado:**
```
Passo 2: Arquivo JSON é baixado
Passo 7: Página recarrega automaticamente
Passo 8: Todas as configs voltam ao estado do backup
```

---

### Teste 37: Resetar Configurações

**Objetivo:** Validar restauração para valores padrão

**Nota:** *Esta funcionalidade está comentada no HTML atual, mas pode ser reativada*

**Passos:**
1. ✏️ Modificar várias configurações:
   - Ativar dark mode
   - Mudar opacidade para 0.5
   - Mudar modo para "Entrevista"
2. ⚙️ Ir para **"Outros"**
3. 🗑️ Clicar **"Restaurar Padrões"**
4. ⚠️ Confirmar diálogo
5. 👀 Observar reload da página
6. 👀 Verificar configurações

**Resultado Esperado:**
```
Passo 4: Diálogo pergunta "Tem certeza que deseja restaurar..."
Passo 5: Página recarrega
Passo 6: Todas configs voltam ao padrão:
         Tema: light
         Opacidade: 0.75
         Modo: Padrão
```

---

### Teste 38: Auto-detecção de Dispositivos

**Objetivo:** Validar checkbox de detecção automática

**Nota:** *Esta funcionalidade pode estar inativa atualmente*

**Passos:**
1. ⚙️ Ir para **"Áudio e Tela"** → **"Áudio"**
2. ☑️ Marcar **"Detectar dispositivos automaticamente"**
3. 🔌 **Conectar novo dispositivo** de áudio (USB/Bluetooth)
4. ⏳ Aguardar 2 segundos
5. 👀 Observar dropdowns de dispositivos

**Resultado Esperado:**
```
✅ Novo dispositivo aparece automaticamente nas opções
✅ Pode ser selecionado imediatamente
```

---

## 🚀 Testes de Performance

### Teste 39: Latência de Transcrição

**Objetivo:** Medir tempo de resposta do Whisper

**Passos:**
1. 🏠 Iniciar escuta
2. 🎙️ Falar frase de 5 segundos
3. 🤫 Parar de falar
4. ⏱️ Cronometrar até aparecer transcrição
5. 👀 Verificar métricas no console

**Resultado Esperado:**
```
Tempo total (stop → exibição): 500-1500ms
Latência aceitável: < 2000ms
Métricas exibidas no console:
  [start: XX:XX:XX - stop: XX:XX:XX]
  (grav XXXms, lat XXXms, total XXXms)
```

---

### Teste 40: Streaming GPT - Primeiro Token

**Objetivo:** Medir tempo para primeiro token do GPT

**Passos:**
1. 🏠 Consolidar pergunta
2. ⌨️ Enviar ao GPT (Ctrl+Enter)
3. ⏱️ Cronometrar até primeiro caractere aparecer
4. 👀 Observar console

**Resultado Esperado:**
```
Primeiro token: 200-800ms
Streaming suave (20-40 tokens/segundo)
Console mostra:
  🟢 GPT_STREAM_CHUNK recebido (token parcial)
```

---

### Teste 41: Consumo de Memória

**Objetivo:** Validar uso de RAM durante operação

**Passos:**
1. 🔧 Abrir **Task Manager** (Windows) ou **Activity Monitor** (macOS)
2. 🚀 Iniciar aplicação
3. 👀 Observar uso de memória (idle)
4. ⏯️ Iniciar escuta + transcrever por 5 minutos
5. 👀 Observar uso de memória (ativo)
6. ⏹️ Parar escuta
7. ⏳ Aguardar 30 segundos
8. 👀 Observar uso de memória (após parar)

**Resultado Esperado:**
```
Idle: 150-250MB
Ativo (transcrevendo): 250-400MB
Após parar: volta para ~150-250MB (garbage collection)
```

---

### Teste 42: VU Meter - FPS

**Objetivo:** Confirmar que monitoramento mantém 60fps

**Passos:**
1. ⚙️ Ir para **"Áudio e Tela"**
2. 🎤 Selecionar dispositivo
3. F12 → **Performance** tab
4. 🔴 Iniciar gravação de performance
5. 🎙️ Fazer barulho por 10 segundos
6. ⏹️ Parar gravação
7. 👀 Analisar gráfico de frames

**Resultado Esperado:**
```
FPS: ~60 (requestAnimationFrame)
Sem drops significativos
Uso de CPU: < 5% (apenas monitoramento)
```

---

### Teste 43: Múltiplas Transcrições Rápidas

**Objetivo:** Validar estabilidade com uso intenso

**Passos:**
1. 🏠 Iniciar escuta
2. 🎙️ Falar 10 frases curtas (1-2 segundos cada)
3. 🤫 Pausa de 2 segundos entre cada frase
4. ⏳ Aguardar todas as transcrições aparecerem
5. 👀 Observar console para erros

**Resultado Esperado:**
```
✅ Todas as 10 frases transcrevem corretamente
✅ Ordem mantida (FIFO)
❌ Sem erros no console
❌ Sem travamentos
```

---

## 📋 Checklist Final

Marque cada teste conforme passar:

### API e Modelos
```
[ ] Teste 1  - Validação de modelo ativo
[ ] Teste 2  - Salvar API key OpenAI
[ ] Teste 3  - Toggle visibilidade de key
[ ] Teste 4  - Ativar modelo sem chave
[ ] Teste 5  - Ativar modelo com chave
[ ] Teste 6  - Desativar modelo (com chave)
[ ] Teste 7  - Deletar API key
[ ] Teste 8  - Modelos exclusivos
```

### Áudio
```
[ ] Teste 9  - Seleção de dispositivo entrada
[ ] Teste 10 - VU Meter entrada (tempo real)
[ ] Teste 11 - Trocar dispositivo entrada
[ ] Teste 12 - Dispositivo saída (VoiceMeeter)
[ ] Teste 13 - Permissões negadas
```

### Transcrição
```
[ ] Teste 14 - Início de escuta
[ ] Teste 15 - Detectar fala
[ ] Teste 16 - Silêncio ignorado
[ ] Teste 17 - Fala longa
[ ] Teste 18 - Parar escuta
```

### Perguntas/Respostas
```
[ ] Teste 19 - Consolidação de pergunta
[ ] Teste 20 - Fechamento automático
[ ] Teste 21 - Resposta GPT streaming
[ ] Teste 22 - Promoção para histórico
[ ] Teste 23 - Pergunta incompleta
[ ] Teste 24 - Modo normal (envio manual)
[ ] Teste 25 - Envio manual (Ctrl+Enter)
[ ] Teste 26 - Múltiplas perguntas
```

### Interface
```
[ ] Teste 27 - Dark mode toggle
[ ] Teste 28 - Controle de opacidade
[ ] Teste 29 - Menu lateral expansão
[ ] Teste 30 - Drag handle
[ ] Teste 31 - Click-through
[ ] Teste 32 - Tabs navegação
[ ] Teste 33 - Seções navegação
[ ] Teste 34 - Botão sair
```

### Configurações
```
[ ] Teste 35 - Salvar configurações modelos
[ ] Teste 36 - Exportar/importar (se ativo)
[ ] Teste 37 - Resetar configurações (se ativo)
[ ] Teste 38 - Auto-detecção dispositivos
```

### Performance
```
[ ] Teste 39 - Latência transcrição
[ ] Teste 40 - Streaming GPT primeiro token
[ ] Teste 41 - Consumo de memória
[ ] Teste 42 - VU Meter FPS
[ ] Teste 43 - Múltiplas transcrições rápidas
```

---

## 🐛 Troubleshooting

### Volume não oscila
```
• Verificar se o dispositivo está selecionado
• Verificar se há áudio no ambiente
• Verificar console para erros (F12)
• Tentar outro dispositivo
• Reiniciar aplicação
```

### Chave API não mostra
```
• Verificar se foi salva corretamente
• Limpar cache/localStorage
• Reabrir a aplicação
• Verificar console para erros
• Tentar deletar e salvar novamente
```

### Modelo não ativa
```
• Verificar se chave tem 10+ caracteres
• Verificar se chave é válida (testar em openai.com)
• Verificar conexão com internet
• Verificar console para erros
• Tentar desativar outros modelos primeiro
```

### Botão "Começar a Ouvir" desabilitado
```
• Ativar um modelo em "API e Modelos"
• Selecionar um dispositivo de áudio
• Verificar se API key está salva
• Verificar console (F12) para erros
• Tentar reabrir aplicação
```

### Transcrição não aparece
```
• Confirmar que modelo está ativo
• Verificar se clicou "Começar a Ouvir"
• Fazer barulho mais alto no microfone
• Aguardar mais tempo (latência pode ser alta)
• Verificar console para erros de API
• Testar API key em openai.com
```

### GPT não responde
```
• Verificar se pergunta está selecionada (borda azul)
• Pressionar Ctrl+Enter novamente
• Verificar modo (Normal vs Entrevista)
• Verificar console para erros
• Testar API key em openai.com
• Verificar créditos da API
```

### Janela não move
```
• Localizar drag handle (topo do menu lateral)
• Verificar se cursor vira "grab"
• Tentar clicar e arrastar mais devagar
• Verificar console para erros
• Reiniciar aplicação
```

### Click-through não funciona
```
• Clicar no botão novamente (pode estar desativado)
• Verificar opacidade do botão (0.5 = ativo)
• Testar em área fora do menu lateral
• Verificar console para erros
• Reiniciar aplicação
```

### Aplicação fecha sozinha
```
• Verificar console para erros antes de fechar
• Verificar uso de memória (Task Manager)
• Verificar logs do sistema operacional
• Desativar modo mock se estiver ativo
• Reinstalar dependências (npm install)
```

### Erro "Cannot read property of undefined"
```
• Verificar se UIElements foi registrado (F12 console)
• Aguardar aplicação carregar completamente
• Verificar ordem de carregamento (renderer.js antes de config-manager.js)
• Limpar cache e reabrir
```

### Erro "API key not configured"
```
• Ir para "API e Modelos" → "OpenAI"
• Salvar uma chave válida
• Clicar em "Ativar"
• Verificar console: "✅ Cliente OpenAI inicializado"
• Tentar transcrever novamente
```

---

## 📝 Notas Importantes

1. **Cada teste deve ser independente** - Se um falhar, os seguintes podem ser afetados
2. **Limpar dados entre testes** - Considere resetar config se necessário
3. **Verificar console sempre** - Pressionar F12 para ver logs de debug
4. **Testar em diferentes ambientes** - Diferentes microfones/speakers podem ter comportamentos distintos
5. **Documentar resultados** - Anotar qualquer comportamento anômalo ou inesperado
6. **Ordem de testes importa** - Alguns testes dependem de estados criados por testes anteriores
7. **Testes de performance** - Executar em máquina com recursos disponíveis (não executar outros apps pesados)

---

## 📞 Próximas Etapas

Se todos os testes passarem:
- [ ] Validação concluída com sucesso ✅
- [ ] Versão pronta para deploy 🚀
- [ ] Considerar testes de carga/performance
- [ ] Documentar casos de uso reais
- [ ] Criar vídeos demonstrativos

Se algum teste falhar:
- [ ] Documentar o comportamento exato
- [ ] Verificar logs no console (F12)
- [ ] Reproduzir o erro 2-3 vezes
- [ ] Criar issue com detalhes completos:
  - Passos para reproduzir
  - Resultado esperado vs obtido
  - Logs do console
  - Versão do Node/Electron
  - Sistema operacional
- [ ] Investigar causa raiz no código

---

## 🎯 Critérios de Sucesso

Para considerar a aplicação **pronta para produção**, deve:

✅ **Funcionalidades Core (100%)**
- Transcrição de áudio funciona
- API keys são salvas/recuperadas
- GPT responde perguntas
- Interface responde corretamente

✅ **Estabilidade (95%+)**
- Sem crashes durante uso normal
- Sem memory leaks após uso prolongado
- Sem erros críticos no console

✅ **Performance (Aceitável)**
- Latência transcrição < 2000ms
- Primeiro token GPT < 1000ms
- VU meters mantêm 60fps
- Consumo RAM < 500MB

✅ **UX/UI (Funcional)**
- Todas as seções navegáveis
- Feedback visual adequado
- Dark mode funciona
- Drag & drop funciona

---

**Data de Criação:** Dezembro 24, 2025  
**Versão Testada:** 1.0.0  
**Status:** Pronto para testes ✅
ado:**
```
Status: ative um modelo de IA antes de começar a ouvir
```
- ❌ Botão NÃO inicia escuta
- ⚠️ Mensagem de erro exibida

**Console esperado:**
```javascript
⚠️ hasActiveModel() retornou false
```

---

### Teste 2: Salvar API Key OpenAI

**Objetivo:** Confirmar que API key é salva e validada corretamente

**Passos:**
1. ⚙️ Ir para aba **"API e Modelos"** → **"OpenAI"**
2. 🔑 Clicar no campo **"Chave da API"**
3. ✏️ Digitar: `sk-proj-test123456789abcdefghijklmnop`
4. 👀 Observar comportamento do campo
5. 💾 Clicar **"Salvar Configurações"**
6. ⏳ Aguardar 2 segundos
7. 👀 Observar feedback visual

**Resultado Esperado:**
```
✅ Campo exibe texto visível enquanto digita
✅ Mensagem: "Configurações salvas com sucesso"
✅ Campo muda para máscara: ••••••••••••••••••••••••
✅ Placeholder: "API key configurada (clique para alterar)"
```

**Console esperado:**
```javascript
main.js: Recebido SAVE_API_KEY - provider: openai
main.js: apiKey recebida (length: 39)
✅ API key salva com segurança para provider: openai
✅ Cliente OpenAI inicializado com sucesso
```

---

### Teste 3: Toggle de Visibilidade de API Key

**Objetivo:** Validar comportamento do botão "olho" (👁️)

**Pré-condições:**
- API key salva (teste 2)

**Passos:**
1. ⚙️ Ainda na aba **"OpenAI"**
2. 👀 Confirmar que campo exibe máscara: `••••••••••••••••••••••••`
3. 👁️ Clicar no **botão do olho** (ícone `visibility`)
4. 👀 Observar valor exibido
5. ⏳ Aguardar 1 segundo
6. 👁️ Clicar no **botão do olho** novamente
7. 👀 Observar comportamento

**Resultado Esperado:**
```
Passo 3: Campo muda para type="text" e exibe chave real
         sk-proj-test123456789abcdefghijklmnop
Passo 4: Botão muda ícone para visibility_off
Passo 6: Campo volta para máscara (••••••)
         Botão volta para ícone visibility
```

**Console esperado:**
```javascript
👁️ Mostrando chave salva de openai
🔒 Ocultando chave digitada
```

---

### Teste 4: Ativar Modelo SEM Chave

**Objetivo:** Confirmar que não consegue ativar modelo sem chave configurada

**Pré-condições:**
- Nenhuma chave Google salva

**Passos:**
1. ⚙️ Ir para aba **"Google"**
2. 👀 Confirmar que campo está vazio
3. 🔘 Clicar **"Ativar"**
4. 👀 Observar resultado

**Resultado Esperado:**
```
❌ Erro: Configure a API key de google antes de ativar
Status badge permanece: "Inativo"
Botão permanece: "Ativar"
```

**Console esperado:**
```javascript
⚠️ Não é possível ativar o modelo google sem chave válida
```

---

### Teste 5: Ativar Modelo COM Chave

**Objetivo:** Confirmar ativação bem-sucedida de modelo

**Pré-condições:**
- API key OpenAI salva (teste 2)

**Passos:**
1. ⚙️ Ir para aba **"OpenAI"**
2. 👀 Confirmar chave configurada (máscara)
3. 🔘 Clicar **"Ativar"**
4. ⏳ Aguardar 1 segundo
5. 👀 Observar mudanças visuais

**Resultado Esperado:**
```
✅ Status badge muda para: "Ativo ●" (verde)
✅ Botão muda para: "Desativar"
✅ Mensagem: "Modelo openai ativado"
```

**Console esperado:**
```javascript
✅ Modelo openai ativado com sucesso
✅ Cliente OpenAI inicializado
```

---

### Teste 6: Desativar Modelo (com chave salva)

**Objetivo:** Confirmar que desativação funciona independente de chave

**Pré-condições:**
- Modelo OpenAI ativo (teste 5)

**Passos:**
1. ⚙️ Ainda na aba **"OpenAI"**
2. 🔘 Clicar **"Desativar"**
3. ⏳ Aguardar 1 segundo
4. 👀 Observar mudanças

**Resultado Esperado:**
```
✅ Status badge volta para: "Inativo" (cinza)
✅ Botão volta para: "Ativar"
✅ Mensagem: "Modelo openai desativado"
❌ Chave NÃO é removida (ainda configurada)
```

**Console esperado:**
```javascript
✅ Modelo openai desativado com sucesso
```

---

### Teste 7: Deletar API Key

**Objetivo:** Confirmar remoção segura de API key

**Pré-condições:**
- API key OpenAI salva

**Passos:**
1. ⚙️ Ir para aba **"OpenAI"**
2. 🗑️ Clicar no **botão de lixeira** (ícone `delete`)
3. ⚠️ Confirmar diálogo: "Tem certeza que deseja remover..."
4. 👀 Observar resultado

**Resultado Esperado:**
```
✅ Mensagem: "API key de openai removida"
✅ Campo limpa (valor vazio)
✅ Placeholder volta: "Insira sua API key"
✅ Atributo data-has-key="false"
```

**Console esperado:**
```javascript
✅ API key de openai removida com sucesso
🗑️ API key removida para provider: openai
```

---

### Teste 8: Modelos Exclusivos

**Objetivo:** Confirmar que apenas 1 modelo pode estar ativo

**Pré-condições:**
- API keys OpenAI e Google configuradas
- Modelo OpenAI ativo

**Passos:**
1. ⚙️ Ir para aba **"Google"**
2. 🔘 Clicar **"Ativar"** (Google)
3. 👀 Observar ambas as abas

**Resultado Esperado:**
```
✅ Google fica "Ativo"
✅ OpenAI automaticamente fica "Inativo"
✅ Mensagem: "Modelo google ativado"
```

**Console esperado:**
```javascript
✅ Desativando outros modelos primeiro
✅ Modelo google ativado com sucesso
```

---

## 🎤 Testes de Áudio

### Teste 9: Seleção de Dispositivo de Entrada

**Objetivo:** Validar seleção e listagem de microfones

**Passos:**
1. ⚙️ Ir para aba **"Áudio e Tela"** → **"Áudio"**
2. 📋 Observar dropdown **"Dispositivo de Entrada"**
3. 👀 Verificar opções disponíveis
4. 🎤 Selecionar um microfone
5. ⏳ Aguardar 2 segundos
6. 📊 Observar VU meter de entrada

**Resultado Esperado:**
```
Dropdown contém:
  🔇 Nenhum (Desativado)
  🎤 Microfone (Realtek High Definition Audio)
  🎤 Microfone (USB Audio Device)
  ...

VU meter DEVE oscilar IMEDIATAMENTE após selecionar
SEM precisar clicar "Começar a Ouvir"
```

**Console esperado:**
```javascript
✅ Dispositivos de áudio carregados: 3
💾 Dispositivos salvos: { input: 'deviceId123', output: '' }
🔊 Iniciando monitoramento de volume (input)...
✅ Monitoramento de volume de entrada iniciado
```

---

### Teste 10: VU Meter - Entrada (Tempo Real)

**Objetivo:** Confirmar que volume oscila em tempo real

**Pré-condições:**
- Microfone selecionado (teste 9)
- **NÃO clicar "Começar a Ouvir"**

**Passos:**
1. ⚙️ Ainda na aba **"Áudio"**
2. 👀 Observar barra verde **"Nível de Volume (Entrada)"**
3. 🎙️ **Fazer barulho** perto do microfone (falar/bater palmas)
4. 📊 Observar oscilação da barra
5. 🤫 Ficar em silêncio
6. 📊 Observar barra voltar para 0%

**Resultado Esperado:**
```
Barra oscila IMEDIATAMENTE ao fazer barulho
Cores mudam:
  🟢 Verde (baixo volume)
  🟡 Amarelo (médio)
  🔴 Vermelho (alto)
Barra volta para 0% no silêncio
```

**Console esperado:**
```javascript
(nenhum log - monitoramento silencioso)
```

---

### Teste 11: Trocar Dispositivo de Entrada

**Objetivo:** Validar reinicialização de monitoramento

**Pré-condições:**
- Dispositivo de entrada já selecionado

**Passos:**
1. ⚙️ Ainda na aba **"Áudio"**
2. 🎤 **Selecionar outro microfone** (diferente do atual)
3. ⏳ Aguardar 2 segundos
4. 🎙️ Fazer barulho no novo microfone
5. 📊 Observar VU meter

**Resultado Esperado:**
```
✅ Stream anterior é fechada
✅ Nova stream inicia automaticamente
✅ VU meter começa a oscilar com novo dispositivo
✅ Sem necessidade de clicar "Começar a Ouvir"
```

**Console esperado:**
```javascript
⚠️ Erro ao parar input monitor: (pode aparecer, normal)
🔊 Iniciando monitoramento de volume (input)...
✅ Monitoramento de volume de entrada iniciado
```

---

### Teste 12: Dispositivo de Saída (VoiceMeeter)

**Objetivo:** Validar captura de áudio de outros participantes

**Pré-requisitos:**
- VoiceMeeter instalado (ou similar)
- Áudio tocando no sistema

**Passos:**
1. ⚙️ Ir para **"Dispositivo de Saída"**
2. 🔊 Selecionar **VoiceMeeter Output** (ou speaker)
3. ⏳ Aguardar 2 segundos
4. 🎵 Tocar áudio no sistema (música/vídeo)
5. 📊 Observar VU meter de saída

**Resultado Esperado:**
```
✅ VU meter OSCILA conforme áudio do sistema
✅ Independente de "Começar a Ouvir"
```

**Console esperado:**
```javascript
🔊 Iniciando monitoramento de volume (output)...
✅ Monitoramento de volume de saída iniciado
```

---

### Teste 13: Permissões de Áudio Negadas

**Objetivo:** Validar comportamento quando permissões são negadas

**Pré-condições:**
- Permissões de áudio NÃO concedidas

**Passos:**
1. 🚀 Abrir aplicação pela primeira vez
2. ⚠️ Navegador/sistema pede permissão de microfone
3. ❌ **Negar permissão**
4. ⚙️ Ir para aba **"Áudio e Tela"**
5. 🎤 Tentar selecionar microfone

**Resultado Esperado:**
```
❌ Dropdown vazio ou com erro
⚠️ Mensagem de erro no console
```

**Console esperado:**
```javascript
❌ Erro ao iniciar monitoramento de volume de entrada: NotAllowedError
```

**Solução:**
```
1. Conceder permissões manualmente nas configurações do navegador/sistema
2. Reabrir aplicação
3. Tentar novamente
```

---

## 📝 Testes de Transcrição

### Teste 14: Transcrição - Início de Escuta

**Objetivo:** Validar início de captura de áudio

**Pré-condições:**
- Modelo OpenAI ativo
- Microfone selecionado

**Passos:**
1. 🏠 Ir para aba **"Home"**
2. ⏯️ Clicar **"Começar a Ouvir"**
3. 👀 Observar mudanças visuais
4. 👀 Observar status

**Resultado Esperado:**
```
✅ Botão muda para: "Stop"
✅ Status: "Status: ouvindo..."
✅ VU meters continuam oscilando
```

**Console esperado:**
```javascript
🎯 Modo restaurado: INTERVIEW
✅ Controller inicializado com sucesso
```

---

### Teste 15: Transcrição - Detectar Fala

**Objetivo:** Confirmar que áudio é capturado ao falar

**Pré-condições:**
- Escuta ativa (teste 14)

**Passos:**
1. 🏠 Ainda na aba **"Home"**
2. 🎙️ **Falar no microfone**: "Olá, este é um teste"
3. 👀 Observar seção **"Transcrição"**
4. ⏳ Aguardar 2-5 segundos
5. 👀 Observar resultado

**Resultado Esperado:**
```
Seção "Transcrição" exibe:
[14:30:15] Você: ...
(aguarda transcrição)
[14:30:18] Você: Olá, este é um teste
[start: 14:30:15 - stop: 14:30:16] (grav 1200ms, lat 450ms, total 1650ms)
```

**Console esperado:**
```javascript
🎙️ iniciando gravação de entrada - startAt 14:30:15
⏹️ parando gravação de entrada por silêncio
STT main: received transcribe-audio buffer, size: 38400
✅ timing: ipc_stt_roundtrip 450 ms
✅ Placeholder atualizado com texto final
```

---

### Teste 16: Transcrição - Silêncio Ignorado

**Objetivo:** Confirmar que ruídos pequenos são ignorados

**Pré-condições:**
- Escuta ativa

**Passos:**
1. 🏠 Ainda na aba **"Home"**
2. 🤫 Ficar em **silêncio total** por 5 segundos
3. 💨 Fazer **ruído muito baixo** (respirar/esfregar dedo)
4. 👀 Observar se aparece na transcrição
5. ⏳ Aguardar 5 segundos

**Resultado Esperado:**
```
❌ Nenhuma transcrição gerada
✅ Blob muito pequeno é descartado (< 1000 bytes)
```

**Console esperado:**
```javascript
(nada ou)
⚠️ Buffer muito pequeno, ignorando
```

---

### Teste 17: Transcrição - Fala Longa

**Objetivo:** Validar transcrição de áudio prolongado

**Pré-condições:**
- Escuta ativa

**Passos:**
1. 🏠 Aba **"Home"**
2. 🎙️ **Falar continuamente** por 10-15 segundos:
   ```
   "O que é programação orientada a objetos?
   Como implementar herança múltipla em Java?
   Explique o padrão Singleton e suas vantagens."
   ```
3. 🤫 Parar de falar
4. ⏳ Aguardar 3-5 segundos
5. 👀 Observar transcrição

**Resultado Esperado:**
```
Transcrição aparece completa:
[14:32:10] Você: O que é programação orientada a objetos? Como implementar herança múltipla em Java? Explique o padrão Singleton e suas vantagens.
[start: 14:32:00 - stop: 14:32:10] (grav 10200ms, lat 580ms, total 10780ms)
```

**Console esperado:**
```javascript
STT main: received transcribe-audio buffer, size: 96000
timing: ipc_stt_roundtrip 580 ms
```

---

### Teste 18: Transcrição - Parar Escuta

**Objetivo:** Confirmar que escuta pode ser interrompida

**Pré-condições:**
- Escuta ativa

**Passos:**
1. 🏠 Aba **"Home"**
2. ⏯️ Clicar **"Stop"**
3. 👀 Observar mudanças
4. 🎙️ Tentar falar no microfone
5. 👀 Confirmar que não transcreve

**Resultado Esperado:**
```
✅ Botão volta para: "Começar a Ouvir"
✅ Status: "Status: parado"
❌ Fala NÃO é transcrita
✅ VU meters CONTINUAM oscilando (monitoramento ativo)
```

**Console esperado:**
```javascript
⏹️ inputRecorder.onstop chamado
```

---

## ❓ Testes de Perguntas e Respostas

### Teste 19: Consolidação de Pergunta (Modo Entrevista)

**Objetivo:** Validar detecção automática de perguntas

**Pré-condições:**
- Modo **"Entrevista"** selecionado
- Escuta ativa
- VoiceMeeter capturando áudio de outro participante

**Passos:**
1. 🏠 Aba **"Home"**
2. 🔊 **Reproduzir pergunta** via speaker (simula entrevistador):
   ```
   "O que é polimorfismo em Java?"
   ```
3. ⏳ Aguardar 5 segundos (transcrição + consolidação)
4. 👀 Observar seção **"Perguntas Consolidadas"**

**Resultado Esperado:**
```
Seção "Perguntas Consolidadas" exibe:
┌─────────────────────────────────────────┐
│ ⚠️ 14:35:20 — O que é polimorfismo em Java? │ ← Pergunta Atual (amarelo)
└─────────────────────────────────────────┘

✅ Borda azul indica seleção
✅ Timeout de 300ms aguarda finalização
```

**Console esperado:**
```javascript
🟠 handleSpeech - author: Outros
🧠 currentQuestion (parcial): O que é polimorfismo
🎯 interviewTurnId: 1
🧪 temporizador de auto-fechamento definido
```

---

### Teste 20: Fechamento Automático de Pergunta

**Objetivo:** Confirmar timeout de 300ms fecha pergunta

**Pré-condições:**
- Pergunta detectada (teste 19)

**Passos:**
1. 👀 Observar **"Pergunta Atual"** (amarelo)
2. ⏳ Aguardar **300ms** (sem nova fala)
3. 👀 Observar mudança

**Resultado Esperado:**
```
Pergunta Atual PERMANECE visível
(modo entrevista NÃO promove automaticamente)
Aguarda GPT responder primeiro
```

**Console esperado:**
```javascript
⏱️ Auto close question disparado
➡️ closeCurrentQuestion chamou askGpt
```

---

### Teste 21: Resposta GPT Automática (Streaming)

**Objetivo:** Validar streaming de resposta em tempo real

**Pré-condições:**
- Pergunta consolidada (teste 20)

**Passos:**
1. 👀 Observar seção **"Respostas GPT"** (direita)
2. ⏳ Aguardar início do streaming
3. 👀 Observar tokens aparecendo

**Resultado Esperado:**
```
Resposta aparece token por token:
┌────────────────────────────────────────┐
│ ⏱️ 14:35:20 — O que é polimorfismo...  │
│ ───────────────────────────────────── │
│ Polimorfismo é a capacidade de um...  │ ← Texto streaming
│ objeto assumir múltiplas formas...    │
└────────────────────────────────────────┘

✅ Borda azul lateral (ativa)
✅ Scroll automático para resposta
```

**Console esperado:**
```javascript
⏳ enviando para o GPT via stream...
🟢 GPT_STREAM_CHUNK recebido (token parcial) Polim
🟢 GPT_STREAM_CHUNK recebido (token parcial) orfismo
🟢 GPT_STREAM_CHUNK recebido (token parcial)  é
...
✅ GPT_STREAM_END recebido (stream finalizado)
```

---

### Teste 22: Promoção de Pergunta para Histórico

**Objetivo:** Confirmar que pergunta vai para histórico após resposta

**Pré-condições:**
- Resposta GPT finalizada (teste 21)

**Passos:**
1. 👀 Observar **"Pergunta Atual"** (amarelo)
2. 👀 Observar **"Histórico de Perguntas"** (abaixo)
3. ⏳ Aguardar 1 segundo

**Resultado Esperado:**
```
Pergunta Atual LIMPA (vazia)
Histórico contém:
┌───────────────────────────────────────┐
│ ✅ ⏱️ 14:35:20 — O que é polimorfismo...│ ← Borda verde (respondida)
└───────────────────────────────────────┘
```

**Console esperado:**
```javascript
📚 promovendo pergunta para histórico
✅ gptAnsweredTurnId definido: 1
```

---

### Teste 23: Pergunta Incompleta (Detectar e Marcar)

**Objetivo:** Validar detecção de perguntas cortadas

**Pré-condições:**
- Modo entrevista ativo

**Passos:**
1. 🔊 Reproduzir pergunta **incompleta**:
   ```
   "O que é abstra..." (corta antes de terminar)
   ```
2. ⏳ Aguardar 5 segundos
3. 👀 Observar histórico

**Resultado Esperado:**
```
Histórico contém:
┌───────────────────────────────────────┐
│ ⚠️ O que é abstra...                  │ ← Badge "incompleta"
└───────────────────────────────────────┘

✅ NÃO envia ao GPT automaticamente
✅ Requer clique manual para enviar
```

**Console esperado:**
```javascript
⚠️ pergunta incompleta detectada
✅ promovendo ao histórico como incompleta
```

---

### Teste 24: Modo Normal - Envio Manual

**Objetivo:** Validar que modo normal NÃO envia automaticamente

**Pré-condições:**
- Modo **"Padrão"** selecionado

**Passos:**
1. ⚙️ Ir para **"Outros"** → Modo: **"Padrão"**
2. 🏠 Voltar para **"Home"**
3. ⏯️ Clicar **"Começar a Ouvir"**
4. 🔊 Reproduzir pergunta:
   ```
   "O que é encapsulamento?"
   ```
5. ⏳ Aguardar 10 segundos
6. 👀 Observar se GPT responde automaticamente

**Resultado Esperado:**
```
❌ GPT NÃO responde automaticamente
✅ Pergunta vai para histórico
✅ Requer clique em "Gerar resposta" (Ctrl+Enter)
```

**Console esperado:**
```javascript
🔵 modo NORMAL — promovendo CURRENT para histórico sem chamar GPT
```

---

### Teste 25: Envio Manual ao GPT (Ctrl+Enter)

**Objetivo:** Confirmar envio manual de pergunta

**Pré-condições:**
- Pergunta no histórico (teste 24)

**Passos:**
1. 🏠 Aba **"Home"**
2. 👆 **Clicar na pergunta** no histórico
3. ⌨️ Pressionar **Ctrl+Enter**
4. 👀 Observar seção **"Respostas GPT"**

**Resultado Esperado:**
```
✅ Nova resposta aparece (batch, não streaming)
✅ Pergunta marcada com borda verde (respondida)
```

**Console esperado:**
```javascript
🤖 askGpt chamado | questionId: uuid-123
⏳ enviando para o GPT (batch)...
✅ resposta do GPT recebida (batch)
```

---

### Teste 26: Múltiplas Perguntas Simultâneas

**Objetivo:** Validar gerenciamento de múltiplas perguntas

**Pré-condições:**
- Modo entrevista ativo

**Passos:**
1. 🔊 Reproduzir 3 perguntas rapidamente:
   ```
   "O que é herança?"
   "Como funciona interfaces?"
   "Diferença entre abstract e interface?"
   ```
2. ⏳ Aguardar 10 segundos
3. 👀 Observar histórico e respostas

**Resultado Esperado:**
```
Histórico contém 3 perguntas (ordem reversa)
Apenas a ÚLTIMA recebe resposta automática
Outras ficam no histórico aguardando envio manual
```

**Console esperado:**
```javascript
🎯 interviewTurnId: 1
🎯 interviewTurnId: 2
🎯 interviewTurnId: 3
✅ gptAnsweredTurnId: 3 (apenas última)
```

---

## 🎨 Testes de Interface

### Teste 27: Dark Mode Toggle

**Objetivo:** Validar alternância de tema

**Passos:**
1. ⚙️ Ir para **"Outros"**
2. 🌙 Clicar no **"Dark Mode"** toggle switch
3. 👀 Observar mudanças visuais
4. 🔄 Clicar novamente (volta para light)

**Resultado Esperado:**
```

```

**Console esperado:**
```javascript

```
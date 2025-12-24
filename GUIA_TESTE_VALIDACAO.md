# 🧪 GUIA DE VALIDAÇÃO - Testes Manuais

Após as correções implementadas, aqui estão os testes para validar cada funcionalidade:

---

## ✅ Teste 1: Validação de Modelo Ativo

**Objetivo:** Confirmar que não consegue iniciar escuta sem modelo ativo

**Passos:**
1. ⚙️ Abrir a aplicação
2. 🚫 NÃO ativar nenhum modelo
3. ⏯️ Clicar botão "Começar a Ouvir (Ctrl+d)"
4. 👀 Observar o status na tela

**Resultado Esperado:**
```
Status: ative um modelo de IA antes de começar a ouvir
```

**Botão deve ficar desabilitado** (visualmente ou com mensagem de erro)

---

## ✅ Teste 2: Ativar Modelo com Chave

**Objetivo:** Confirmar que consegue iniciar escuta após ativar modelo

**Passos:**
1. ⚙️ Ir para aba "API e Modelos" → "OpenAI"
2. 🔑 Inserir uma chave API válida
3. 💾 Clicar "Salvar Configurações"
4. ✅ Clicar "Ativar" (botão deve mudar de "Desativar")
5. ⏯️ Voltar à aba Home e clicar "Começar a Ouvir"
6. 👀 Observar o status

**Resultado Esperado:**
```
Status: ouvindo...
Botão muda para "Stop"
```

---

## ✅ Teste 3: Desativar Modelo SEM Chave

**Objetivo:** Confirmar que consegue desativar mesmo com chave salva

**Passos:**
1. ✅ Com modelo OpenAI ativo (de teste 2)
2. ⚙️ Ir para aba "API e Modelos" → "Google"
3. 🚫 NÃO preencher chave API (deixar vazio)
4. 🔘 Clicar "Ativar"
5. 👀 Observar resultado

**Resultado Esperado (A):**
```
Erro: Configure a API key de google antes de ativar
```

**Passos (continuação):**
6. ⚙️ Ir para "OpenAI" (que tinha chave salva)
7. 🔘 Clicar "Desativar"
8. 👀 Observar resultado

**Resultado Esperado (B):**
```
Status badge muda para "Inativo"
Botão muda para "Ativar"
Modelo desativado com sucesso
```

---

## ✅ Teste 4: Input API Key - Comportamento de Máscara

**Objetivo:** Validar toggle de visibilidade em todos os cenários

### Cenário A: Campo novo (sem chave salva)
**Passos:**
1. ⚙️ Ir para aba "API e Modelos" → "Google"
2. 🔑 Clicar no campo de API key (está vazio)
3. ✏️ Digitar: `sk-test-123456789abc`
4. 👁️ Observar o campo
5. 👁️ Clicar no botão do olho
6. 👁️ Clicar no botão do olho novamente
7. 💾 Clicar "Salvar Configurações"
8. 🔄 Aguardar 2 segundos
9. 👁️ Clicar no botão do olho

**Resultado Esperado:**
```
Passo 3: Texto visível (type=text) enquanto digita
Passo 4: Não está mascarado
Passo 5: Fica mascarado (tipo=password)
Passo 6: Mostra novamente a chave digitada
Passo 7-9: Busca chave do secure store e exibe
```

### Cenário B: Campo com chave salva
**Passos:**
1. ⚙️ Ainda na aba Google (da etapa anterior)
2. 🔄 Aguardar que o campo exiba máscara
3. 👁️ Clicar no botão do olho
4. 👀 Observar o valor
5. 👁️ Clicar no botão do olho novamente
6. 🔑 Campo recebe foco (clica dentro do campo)
7. ✏️ Digitar nova chave: `sk-new-xyz789`
8. 👁️ Clicar no botão do olho

**Resultado Esperado:**
```
Passo 3: Campo exibe a chave recuperada (sk-test-...)
Passo 5: Campo volta a máscaras (•••••)
Passo 6: Campo limpa (oferece chance de editar)
Passo 7: Texto da nova chave visível
Passo 8: Nova chave mascara (tipo=password)
```

---

## ✅ Teste 5: Volume ao Iniciar App

**Objetivo:** Confirmar que volume oscila desde o início

**Pré-requisitos:**
- Ter pelo menos um dispositivo de áudio (microfone ou speaker)
- Som/ruído no ambiente

**Passos:**
1. 🚀 **Fechar** completamente a aplicação
2. 🚀 **Abrir** a aplicação (NÃO clicar em nada)
3. ⚙️ Ir para aba "Áudio e Tela"
4. 🎤 Selecionar um dispositivo input (microfone)
5. 🔊 Selecionar um dispositivo output (speaker/saída)
6. 👀 **SEM clicar em "Começar a Ouvir"**
7. 🎙️ Fazer barulho perto do microfone
8. 📊 Observar a barra de volume

**Resultado Esperado:**
```
A barra DEVE oscilar imediatamente após selecionar dispositivo
NÃO é necessário clicar "Começar a Ouvir"
Oscilação deve reagir ao som ambiente em tempo real
```

**Passos adicionais (reinicialização):**
9. 🎤 Mudar para outro dispositivo input
10. 👀 Aguardar 2 segundos
11. 🎙️ Fazer barulho novamente
12. 📊 Observar a barra

**Resultado Esperado:**
```
Passo 10: Novo dispositivo começa a monitorar imediatamente
Passo 12: Barra oscila para novo dispositivo
```

---

## 📋 Checklist de Validação

Marque cada teste conforme passar:

```
Teste 1 - Validação de modelo ativo
   [ ] Mensagem de erro exibe corretamente
   [ ] Botão não inicia escuta

Teste 2 - Ativar modelo com chave
   [ ] Modelo ativa com sucesso
   [ ] Consegue iniciar escuta

Teste 3 - Desativar sem chave
   [ ] Erro ao tentar ativar sem chave
   [ ] Consegue desativar modelo ativo

Teste 4A - Input novo (sem chave)
   [ ] Texto visível ao digitar
   [ ] Toggle mostra/oculta
   [ ] Salva com sucesso

Teste 4B - Input com chave salva
   [ ] Toggle mostra chave do store
   [ ] Permite editar chave
   [ ] Novo valor pode ser mascarado/visível

Teste 5 - Volume ao iniciar
   [ ] Volume oscila ao selecionar dispositivo
   [ ] Sem precisar clicar "Começar a Ouvir"
   [ ] Reinicia ao mudar dispositivo
```

---

## 🐛 Troubleshooting

### Volume não oscila
```
• Verificar se o dispositivo está selecionado
• Verificar se há áudio no ambiente
• Verificar console para erros (F12)
• Tentar outro dispositivo
```

### Chave API não mostra
```
• Verificar se foi salva corretamente
• Limpar cache/localStorage
• Reabrir a aplicação
• Verificar console para erros
```

### Modelo não ativa
```
• Verificar se chave tem 10+ caracteres
• Verificar se chave é válida
• Verificar conexão com internet
• Verificar console para erros
```

### Botão "Começar a Ouvir" desabilitado
```
• Ativar um modelo em "API e Modelos"
• Selecionar um dispositivo de áudio
• Tentar novamente
```

---

## 📝 Notas Importantes

1. **Cada teste deve ser independente** - Se um falhar, os seguintes podem ser afetados
2. **Limpar dados entre testes** - Considere resetar config se necessário
3. **Verificar console** - Pressionar F12 para ver logs de debug
4. **Testar em diferentes ambientes** - Diferentes microfones/speakers
5. **Documentar resultados** - Anotar qualquer comportamento anômalo

---

## 📞 Próximas Etapas

Se todos os testes passarem:
- [ ] Validação concluída com sucesso
- [ ] Versão pronta para deploy
- [ ] Considerar testes de carga/performance

Se algum teste falhar:
- [ ] Documentar o comportamento
- [ ] Verificar logs no console (F12)
- [ ] Criar issue com detalhes
- [ ] Investigar causa raiz

---

**Data:** Dezembro 24, 2025  
**Versão:** refact-v1-ok (corrigido)  
**Pronto para testes:** ✅ SIM


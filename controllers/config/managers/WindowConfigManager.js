// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * WindowConfigManager - Gerencia configurações de janela
 *
 * Responsabilidades:
 *   - Dark mode toggle
 *   - Interview mode selection
 *   - Overlay opacity control
 *   - Drag handle initialization
 *
 * Interações:
 *   - DOM: darkModeToggle, interviewModeSelect, opacityRange, dragHandle
 *   - ConfigManager: salvar/restaurar estado
 *   - CSS: aplicar classe dark (body.dark)
 *   - RendererAPI: setWindowOpacity(), startWindowDrag()
 */
class WindowConfigManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('🪟 WindowConfigManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 WindowConfigManager.initialize()');
    await this.restoreState();
    this.#initWindowListeners();
    await this.initClickThroughController();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    console.log('📂 WindowConfigManager.restoreState()');
    this.restoreUserPreferences();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    console.log('🔄 WindowConfigManager.reset()');
    this.configManager.config.other.darkMode = true;
    this.configManager.config.other.interviewMode = 'INTERVIEW';
    this.configManager.config.other.overlayOpacity = 0.75;
    this.configManager.saveConfig(false);
    await this.restoreState();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Restaura preferências de janela salvas
   */
  restoreUserPreferences() {
    Logger.debug('Início da função: "restoreUserPreferences"');
    console.log('🔄 RESTAURANDO PREFERÊNCIAS DA JANELA...');

    // 1️⃣ Restaurar Dark Mode
    const darkModeToggle = document.getElementById('darkModeToggle');
    const savedDarkMode = this.configManager.config.other?.darkMode ?? false;
    if (darkModeToggle) {
      darkModeToggle.checked = savedDarkMode;
      if (savedDarkMode) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
      console.log(`   ✅ Dark Mode restaurado: ${savedDarkMode ? 'ATIVADO' : 'DESATIVADO'}`);
    } else {
      console.warn('   ⚠️ darkModeToggle não encontrado no DOM');
    }

    // 2️⃣ Restaurar Interview Mode
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    const savedInterviewMode = this.configManager.config.other?.interviewMode ?? 'INTERVIEW';
    if (interviewModeSelect) {
      interviewModeSelect.value = savedInterviewMode;
      console.log(`   ✅ Interview Mode restaurado: ${savedInterviewMode}`);
    } else {
      console.warn('   ⚠️ interviewModeSelect não encontrado no DOM');
    }

    // 3️⃣ Restaurar Opacity
    const opacityRange = document.getElementById('opacityRange');
    const savedOpacity = this.configManager.config.other?.overlayOpacity ?? 0.75;
    if (opacityRange) {
      opacityRange.value = savedOpacity;
      this.applyOpacity(savedOpacity);
      console.log(`   ✅ Opacidade restaurada: ${savedOpacity}`);
    } else {
      console.warn('   ⚠️ opacityRange não encontrado no DOM');
    }

    // 4️⃣ Inicializar drag handle
    const dragHandle = document.getElementById('dragHandle');
    if (dragHandle) {
      this.initDragHandle(dragHandle);
      console.log(`   ✅ Drag handle inicializado`);
    } else {
      console.warn('   ⚠️ dragHandle não encontrado no DOM');
    }

    console.log('✅ Preferências restauradas');
    Logger.debug('Fim da função: "restoreUserPreferences"');
  }

  /**
   * Aplica opacidade na janela
   * @param {number} opacity - Valor de 0 a 1
   */
  applyOpacity(opacity) {
    console.log(`🎨 Aplicando opacidade: ${opacity}`);
    const opacityValue = Number.parseFloat(opacity);

    // Aplicar CSS na janela
    if (globalThis.RendererAPI?.setWindowOpacity) {
      globalThis.RendererAPI.setWindowOpacity(opacityValue).catch((err) => {
        console.error('❌ Erro ao definir opacidade:', err);
      });
    }

    this.configManager.config.other.overlayOpacity = opacityValue;
  }

  /**
   * Inicializa drag handle da janela
   * @param {HTMLElement} dragHandle - Elemento para arrastar
   */
  initDragHandle(dragHandle) {
    console.log('🖱️ Inicializando drag handle...');

    dragHandle.addEventListener('mousedown', async (e) => {
      // Evita comportamento padrão e propagação
      e.preventDefault();
      e.stopPropagation();

      if (!globalThis.RendererAPI?.startWindowDrag) {
        console.warn('⚠️ RendererAPI.startWindowDrag não disponível');
        return;
      }

      // Adicionar feedback visual
      dragHandle.classList.add('drag-active');

      try {
        // Notifica o main process para preparar o arraste (ex: moveTop)
        await globalThis.RendererAPI.startWindowDrag();

        // Posição inicial do mouse na tela (absoluta)
        const startCursor = { x: e.screenX, y: e.screenY };

        // Posição inicial da janela
        const startBounds = await this.ipc.invoke('GET_WINDOW_BOUNDS');

        if (!startBounds) {
          dragHandle.classList.remove('drag-active');
          return;
        }

        const onMouseMove = (ev) => {
          // Calcula o deslocamento
          const dx = ev.screenX - startCursor.x;
          const dy = ev.screenY - startCursor.y;

          // Envia nova posição para o Main process
          this.ipc.send('MOVE_WINDOW_TO', {
            x: startBounds.x + dx,
            y: startBounds.y + dy,
          });
        };

        const onMouseUp = () => {
          dragHandle.classList.remove('drag-active');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          console.log('🪟 Drag finalizado');
        };

        // Registra listeners no document para capturar movimento fora do handle
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        console.log('🪟 Drag iniciado');
      } catch (err) {
        console.error('❌ Erro durante o arraste da janela:', err);
        dragHandle.classList.remove('drag-active');
      }
    });

    console.log('✅ Drag handle inicializado');
  }

  /**
   * Salva campo de janela
   * @param {string} field - Campo a salvar
   * @param {*} value - Novo valor
   */
  saveWindowField(field, value) {
    Logger.debug('Início da função: "saveWindowField"');
    console.log(`💾 Salvando ${field}: ${value}`);

    if (field === 'darkModeToggle') {
      this.configManager.config.other.darkMode = value;
      if (value) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    } else if (field === 'interviewModeSelect') {
      this.configManager.config.other.interviewMode = value;
    } else if (field === 'opacityRange') {
      this.applyOpacity(value);
    }

    // Para opacityRange: salvar silenciosamente (sem feedback visual)
    // Para outros campos: mostrar feedback visual
    const showFeedback = field !== 'opacityRange';
    this.configManager.saveConfig(showFeedback);

    console.log(`   ✅ Campo ${field} salvo`);
    Logger.debug('Fim da função: "saveWindowField"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de janela
   */
  #initWindowListeners() {
    console.log('🎯 WindowConfigManager.#initWindowListeners()');

    // Listener para dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', (e) => {
        this.saveWindowField('darkModeToggle', e.target.checked);
        console.log(`   📝 Dark Mode: ${e.target.checked ? 'Ativado' : 'Desativado'}`);
      });
      console.log('   ✅ Listener para darkModeToggle registrado');
    } else {
      console.warn('   ⚠️ darkModeToggle não encontrado');
    }

    // Listener para interview mode select
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    if (interviewModeSelect) {
      interviewModeSelect.addEventListener('change', (e) => {
        this.saveWindowField('interviewModeSelect', e.target.value);
        console.log(`   📝 Interview Mode alterado: ${e.target.value}`);
      });
      console.log('   ✅ Listener para interviewModeSelect registrado');
    } else {
      console.warn('   ⚠️ interviewModeSelect não encontrado');
    }

    // Listener para opacity range
    const opacityRange = document.getElementById('opacityRange');
    if (opacityRange) {
      // Usar 'input' para feedback visual em tempo real
      opacityRange.addEventListener('input', (e) => {
        this.applyOpacity(e.target.value);
        console.log(`   📝 Opacidade visual alterada: ${e.target.value}`);
      });
      // Usar 'change' para salvar apenas no final (mouse up)
      opacityRange.addEventListener('change', (e) => {
        this.saveWindowField('opacityRange', e.target.value);
        console.log(`   💾 Opacidade salva: ${e.target.value}`);
      });
      console.log('   ✅ Listener para opacityRange registrado');
    } else {
      console.warn('   ⚠️ opacityRange não encontrado');
    }
  }

  /**
   * Inicializa click-through controller
   */
  async initClickThroughController() {
    console.log('🖱️ Inicializando click-through controller...');

    const btnToggleClick = document.getElementById('btnToggleClick');

    if (!btnToggleClick) {
      console.warn('   ⚠️ btnToggleClick não encontrado no DOM');
      return;
    }

    try {
      // ✅ SINCRONIZAR: Buscar estado ATUAL de main.js
      const currentClickThroughState = await this.ipc.invoke('GET_CLICK_THROUGH');
      console.log(`   📡 Estado do click-through em main: ${currentClickThroughState}`);

      // ✅ RESTAURAR DECISÃO ANTERIOR DO USUÁRIO
      // Se o usuário fechou com click-through ativo, inicia ativo
      const savedClickThroughState = this.configManager.config.other?.clickThroughEnabled ?? false;
      console.log(`   💾 Estado salvo em localStorage: ${savedClickThroughState}`);

      if (savedClickThroughState && !currentClickThroughState) {
        // User deixou ativado, mas main está desativado - sincronizar ativando
        console.log('🔄 Restaurando click-through para estado anterior (ATIVADO)');
        this.ipc.send('SET_CLICK_THROUGH', true);
      }

      // ✅ Usar estado sincronizado como referência
      let localClickThroughState = savedClickThroughState;
      console.log(
        `   ✅ Click-through iniciará como: ${localClickThroughState ? 'ATIVADO' : 'DESATIVADO'}`
      );

      // ✅ ATUALIZAR VISUAL DO BOTÃO COM ESTADO RESTAURADO
      if (globalThis.RendererAPI?.updateClickThroughButton) {
        globalThis.RendererAPI.updateClickThroughButton(localClickThroughState, btnToggleClick);
        console.log(
          `   🎨 Visual do botão atualizado: opacity=${localClickThroughState ? '0.5' : '1'}`
        );
      }

      // ✅ Registrar listener para alterações
      btnToggleClick.addEventListener('click', async () => {
        try {
          // Toggle local
          localClickThroughState = !localClickThroughState;
          console.log(`🖱️ Click-through: ${localClickThroughState ? 'ATIVANDO' : 'DESATIVANDO'}`);

          // Enviar para main via IPC (one-way)
          this.ipc.send('SET_CLICK_THROUGH', localClickThroughState);

          // Atualizar visual
          if (globalThis.RendererAPI?.updateClickThroughButton) {
            globalThis.RendererAPI.updateClickThroughButton(localClickThroughState, btnToggleClick);
          }

          // Salvar em config
          this.configManager.config.other.clickThroughEnabled = localClickThroughState;
          this.configManager.saveConfig(false);

          console.log(`   ✅ Click-through ${localClickThroughState ? 'ATIVADO' : 'DESATIVADO'}`);
        } catch (error) {
          console.error('❌ Erro ao toggle click-through:', error);
          // Reverter estado local em caso de erro
          localClickThroughState = !localClickThroughState;
        }
      });

      // ✅ ZONA INTERATIVA: Quando click-through está ativado, permitir cliques no botão
      btnToggleClick.addEventListener('mouseenter', () => {
        if (localClickThroughState) {
          console.log('🖱️ Zona interativa ATIVADA (mouse sobre botão)');
          this.ipc.send('SET_INTERACTIVE_ZONE', true);
        }
      });

      btnToggleClick.addEventListener('mouseleave', () => {
        if (localClickThroughState) {
          console.log('🖱️ Zona interativa DESATIVADA (mouse saiu do botão)');
          this.ipc.send('SET_INTERACTIVE_ZONE', false);
        }
      });

      // ✅ ZONAS INTERATIVAS GLOBAIS: Monitorar TODOS os elementos com classe .interactive-zone
      // Nota: SET_INTERACTIVE_ZONE é sempre enviado, mas main.js só aplica se clickThroughEnabled=true
      const interactiveZones = document.querySelectorAll('.interactive-zone');
      console.log(`🖱️ ${interactiveZones.length} zonas interativas encontradas`);

      interactiveZones.forEach((zone) => {
        zone.addEventListener('mouseenter', () => {
          // Ativa zona interativa quando mouse entra (permite cliques se click-through ativo)
          this.ipc.send('SET_INTERACTIVE_ZONE', true);
          console.log(`🖱️ Zona interativa ATIVADA: ${zone.id || zone.className}`);
        });

        zone.addEventListener('mouseleave', () => {
          // Desativa zona interativa quando mouse sai (cliques passam através se CT ativo)
          this.ipc.send('SET_INTERACTIVE_ZONE', false);
          console.log(`🖱️ Zona interativa DESATIVADA: ${zone.id || zone.className}`);
        });
      });

      console.log('   ✅ Click-through controller inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar click-through:', error);
    }
  }

  /**
   * Restaura tema (dark mode)
   */
  restoreTheme() {
    // Implementado em restoreUserPreferences()
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================
}

module.exports = WindowConfigManager;

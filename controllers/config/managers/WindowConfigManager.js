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

    Logger.debug('🪟 WindowConfigManager criado', false);
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    Logger.debug('🚀 WindowConfigManager.initialize()', false);
    await this.restoreState();
    this.#initWindowListeners();
    await this.initClickThroughController();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    Logger.debug('📂 WindowConfigManager.restoreState()', false);
    this.restoreUserPreferences();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    Logger.debug('🔄 WindowConfigManager.reset()', false);
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
    Logger.debug('🔄 RESTAURANDO PREFERÊNCIAS DA JANELA...', false);

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
      Logger.debug(
        `   ✅ Dark Mode restaurado: ${savedDarkMode ? 'ATIVADO' : 'DESATIVADO'}`,
        false
      );
    } else {
      Logger.debug('   ⚠️ darkModeToggle não encontrado no DOM', false);
    }

    // 2️⃣ Restaurar Interview Mode
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    const savedInterviewMode = this.configManager.config.other?.interviewMode ?? 'INTERVIEW';
    if (interviewModeSelect) {
      interviewModeSelect.value = savedInterviewMode;
      Logger.debug(`   ✅ Interview Mode restaurado: ${savedInterviewMode}`, false);

      // 🔥 CRÍTICO: Sincronizar com modeManager quando página carrega
      if (globalThis.RendererAPI?.changeMode) {
        globalThis.RendererAPI.changeMode(savedInterviewMode);
        console.log(`🎯 [BOOT] Modo sincronizado na inicialização: ${savedInterviewMode}`);
      }
    } else {
      Logger.debug('   ⚠️ interviewModeSelect não encontrado no DOM', false);
    }

    // 3️⃣ Restaurar Opacity
    const opacityRange = document.getElementById('opacityRange');
    const savedOpacity = this.configManager.config.other?.overlayOpacity ?? 0.75;
    if (opacityRange) {
      opacityRange.value = savedOpacity;
      this.applyOpacity(savedOpacity);
      Logger.debug(`   ✅ Opacidade restaurada: ${savedOpacity}`, false);
    } else {
      Logger.debug('   ⚠️ opacityRange não encontrado no DOM', false);
    }

    // 4️⃣ Inicializar drag handle
    const dragHandle = document.getElementById('dragHandle');
    if (dragHandle) {
      this.initDragHandle(dragHandle);
      Logger.debug(`   ✅ Drag handle inicializado`, false);
    } else {
      Logger.debug('   ⚠️ dragHandle não encontrado no DOM', false);
    }

    Logger.debug('✅ Preferências restauradas', false);
    Logger.debug('Fim da função: "restoreUserPreferences"');
  }

  /**
   * Aplica opacidade na janela
   * @param {number} opacity - Valor de 0 a 1
   */
  applyOpacity(opacity) {
    Logger.debug(`🎨 Aplicando opacidade: ${opacity}`, false);
    const opacityValue = Number.parseFloat(opacity);

    // Aplicar CSS na janela
    if (globalThis.RendererAPI?.setWindowOpacity) {
      globalThis.RendererAPI.setWindowOpacity(opacityValue).catch((err) => {
        Logger.debug(`❌ Erro ao definir opacidade: ${err}`, false);
      });
    }

    this.configManager.config.other.overlayOpacity = opacityValue;
  }

  /**
   * Inicializa drag handle da janela
   * @param {HTMLElement} dragHandle - Elemento para arrastar
   */
  initDragHandle(dragHandle) {
    Logger.debug('🖱️ Inicializando drag handle...', false);

    dragHandle.addEventListener('mousedown', async (e) => {
      // Evita comportamento padrão e propagação
      e.preventDefault();
      e.stopPropagation();

      if (!globalThis.RendererAPI?.startWindowDrag) {
        Logger.debug('⚠️ RendererAPI.startWindowDrag não disponível', false);
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
          Logger.debug('🪟 Drag finalizado', false);
        };

        // Registra listeners no document para capturar movimento fora do handle
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        Logger.debug('🪟 Drag iniciado', false);
      } catch (err) {
        Logger.debug(`❌ Erro durante o arraste da janela: ${err}`, false);
        dragHandle.classList.remove('drag-active');
      }
    });

    Logger.debug('✅ Drag handle inicializado', false);
  }

  /**
   * Salva campo de janela
   * @param {string} field - Campo a salvar
   * @param {*} value - Novo valor
   */
  saveWindowField(field, value) {
    Logger.debug('Início da função: "saveWindowField"');
    Logger.debug(`💾 Salvando ${field}: ${value}`, false);

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

    Logger.debug(`   ✅ Campo ${field} salvo`, false);
    Logger.debug('Fim da função: "saveWindowField"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de janela
   */
  #initWindowListeners() {
    Logger.debug('🎯 WindowConfigManager.#initWindowListeners()', false);

    // Listener para dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', (e) => {
        this.saveWindowField('darkModeToggle', e.target.checked);
        Logger.debug(`   📝 Dark Mode: ${e.target.checked ? 'Ativado' : 'Desativado'}`, false);
      });
      Logger.debug('   ✅ Listener para darkModeToggle registrado', false);
    } else {
      Logger.debug('   ⚠️ darkModeToggle não encontrado', false);
    }

    // Listener para interview mode select
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    if (interviewModeSelect) {
      interviewModeSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        this.saveWindowField('interviewModeSelect', newMode);
        // 🔥 CRÍTICO: Mudar o modo no modeManager quando o dropdown muda
        if (globalThis.RendererAPI?.changeMode) {
          globalThis.RendererAPI.changeMode(newMode);
          console.log(`🎯 Modo alterado via dropdown: ${newMode}`);
        }
        Logger.debug(`   📝 Interview Mode alterado: ${newMode}`, false);
      });
      Logger.debug('   ✅ Listener para interviewModeSelect registrado', false);
    } else {
      Logger.debug('   ⚠️ interviewModeSelect não encontrado', false);
    }

    // Listener para opacity range
    const opacityRange = document.getElementById('opacityRange');
    if (opacityRange) {
      // Usar 'input' para feedback visual em tempo real
      opacityRange.addEventListener('input', (e) => {
        this.applyOpacity(e.target.value);
        Logger.debug(`   📝 Opacidade visual alterada: ${e.target.value}`, false);
      });
      // Usar 'change' para salvar apenas no final (mouse up)
      opacityRange.addEventListener('change', (e) => {
        this.saveWindowField('opacityRange', e.target.value);
        Logger.debug(`   💾 Opacidade salva: ${e.target.value}`, false);
      });
      Logger.debug('   ✅ Listener para opacityRange registrado', false);
    } else {
      Logger.debug('   ⚠️ opacityRange não encontrado', false);
    }
  }

  /**
   * Inicializa click-through controller
   */
  async initClickThroughController() {
    Logger.debug('🖱️ Inicializando click-through controller...', false);

    const btnToggleClick = document.getElementById('btnToggleClick');

    if (!btnToggleClick) {
      Logger.debug('   ⚠️ btnToggleClick não encontrado no DOM', false);
      return;
    }

    try {
      // ✅ SINCRONIZAR: Buscar estado ATUAL de main.js
      const currentClickThroughState = await this.ipc.invoke('GET_CLICK_THROUGH');
      Logger.debug(`   📡 Estado do click-through em main: ${currentClickThroughState}`, false);

      // ✅ RESTAURAR DECISÃO ANTERIOR DO USUÁRIO
      // Se o usuário fechou com click-through ativo, inicia ativo
      const savedClickThroughState = this.configManager.config.other?.clickThroughEnabled ?? false;
      Logger.debug(`   💾 Estado salvo em localStorage: ${savedClickThroughState}`, false);

      if (savedClickThroughState && !currentClickThroughState) {
        // User deixou ativado, mas main está desativado - sincronizar ativando
        Logger.debug('🔄 Restaurando click-through para estado anterior (ATIVADO)', false);
        this.ipc.send('SET_CLICK_THROUGH', true);
      }

      // ✅ Usar estado sincronizado como referência
      let localClickThroughState = savedClickThroughState;
      Logger.debug(
        `   ✅ Click-through iniciará como: ${localClickThroughState ? 'ATIVADO' : 'DESATIVADO'}`,
        false
      );

      // ✅ ATUALIZAR VISUAL DO BOTÃO COM ESTADO RESTAURADO
      if (globalThis.RendererAPI?.updateClickThroughButton) {
        globalThis.RendererAPI.updateClickThroughButton(localClickThroughState, btnToggleClick);
        Logger.debug(
          `   🎨 Visual do botão atualizado: opacity=${localClickThroughState ? '0.5' : '1'}`,
          false
        );
      }

      // ✅ Registrar listener para alterações
      btnToggleClick.addEventListener('click', async () => {
        try {
          // Toggle local
          localClickThroughState = !localClickThroughState;
          Logger.debug(
            `🖱️ Click-through: ${localClickThroughState ? 'ATIVANDO' : 'DESATIVANDO'}`,
            false
          );

          // Enviar para main via IPC (one-way)
          this.ipc.send('SET_CLICK_THROUGH', localClickThroughState);

          // Atualizar visual
          if (globalThis.RendererAPI?.updateClickThroughButton) {
            globalThis.RendererAPI.updateClickThroughButton(localClickThroughState, btnToggleClick);
          }

          // Salvar em config
          this.configManager.config.other.clickThroughEnabled = localClickThroughState;
          this.configManager.saveConfig(false);

          Logger.debug(
            `   ✅ Click-through ${localClickThroughState ? 'ATIVADO' : 'DESATIVADO'}`,
            false
          );
        } catch (error) {
          Logger.debug(`❌ Erro ao toggle click-through: ${error}`, false);
          // Reverter estado local em caso de erro
          localClickThroughState = !localClickThroughState;
        }
      });

      // ✅ ZONA INTERATIVA: Quando click-through está ativado, permitir cliques no botão
      btnToggleClick.addEventListener('mouseenter', () => {
        if (localClickThroughState) {
          Logger.debug('🖱️ Zona interativa ATIVADA (mouse sobre botão)', false);
          this.ipc.send('SET_INTERACTIVE_ZONE', true);
        }
      });

      btnToggleClick.addEventListener('mouseleave', () => {
        if (localClickThroughState) {
          Logger.debug('🖱️ Zona interativa DESATIVADA (mouse saiu do botão)', false);
          this.ipc.send('SET_INTERACTIVE_ZONE', false);
        }
      });

      // ✅ ZONAS INTERATIVAS GLOBAIS: Monitorar TODOS os elementos com classe .interactive-zone
      // Nota: SET_INTERACTIVE_ZONE é sempre enviado, mas main.js só aplica se clickThroughEnabled=true
      const interactiveZones = document.querySelectorAll('.interactive-zone');
      Logger.debug(`🖱️ ${interactiveZones.length} zonas interativas encontradas`, false);

      interactiveZones.forEach((zone) => {
        zone.addEventListener('mouseenter', () => {
          // Ativa zona interativa quando mouse entra (permite cliques se click-through ativo)
          this.ipc.send('SET_INTERACTIVE_ZONE', true);
          Logger.debug(`🖱️ Zona interativa ATIVADA: ${zone.id || zone.className}`, false);
        });

        zone.addEventListener('mouseleave', () => {
          // Desativa zona interativa quando mouse sai (cliques passam através se CT ativo)
          this.ipc.send('SET_INTERACTIVE_ZONE', false);
          Logger.debug(`🖱️ Zona interativa DESATIVADA: ${zone.id || zone.className}`, false);
        });
      });

      Logger.debug('   ✅ Click-through controller inicializado', false);
    } catch (error) {
      Logger.debug(`❌ Erro ao inicializar click-through: ${error}`, false);
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

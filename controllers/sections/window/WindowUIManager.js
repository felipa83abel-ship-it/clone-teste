// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger, DOM */

/**
 * WindowUIManager - Gerencia configurações de janela
 *
 * Responsabilidades:
 *   - Drag handle initialization (mover janela)
 *   - Click-through toggle (cliques passam através)
 *   - Close application button (btnClose)
 *   - Interactive zones management
 *
 * Interações:
 *   - DOM: dragHandle, btnToggleClick, btnClose
 *   - IPC: SET_CLICK_THROUGH, SET_INTERACTIVE_ZONE, GET_CLICK_THROUGH
 *   - ConfigManager: salvar/restaurar estado
 */
class WindowUIManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    Logger.debug('🪟 WindowUIManager criado', false);
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    Logger.debug('🚀 WindowUIManager.initialize()', false);
    this.#initEventBusListeners();
    this.#initWindowListeners();
    await this.initClickThroughController();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    Logger.debug('📂 WindowUIManager.restoreState()', false);
    this.restoreUserPreferences();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    Logger.debug('🔄 WindowUIManager.reset()', false);
    this.configManager.config.other.clickThroughEnabled = false;
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

    // 1️⃣ Inicializar drag handle
    const dragHandle = DOM.get('dragHandle');
    if (dragHandle) {
      this.initDragHandle(dragHandle);
      Logger.debug(`   ✅ Drag handle inicializado`, false);
    } else {
      Logger.debug('   ⚠️ dragHandle não encontrado no DOM', false);
    }

    // 2️⃣ Inicializar click-through (restaura com initClickThroughController)
    Logger.debug('   ✅ Click-through será inicializado em initClickThroughController', false);

    // 3️⃣ Inicializar botão de fechar
    const btnClose = DOM.get('btnClose');
    if (btnClose) {
      Logger.debug(`   ✅ btnClose inicializado`, false);
    } else {
      Logger.debug('   ⚠️ btnClose não encontrado no DOM', false);
    }

    Logger.debug('✅ Preferências restauradas', false);
    Logger.debug('Fim da função: "restoreUserPreferences"');
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

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

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de janela
   */
  #initWindowListeners() {
    Logger.debug('🎯 WindowUIManager.#initWindowListeners()', false);

    // Listener para botão de fechar app
    const btnClose = DOM.get('btnClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        Logger.debug('🪟 btnClose clicado - enviando APP_CLOSE IPC', false);
        console.log('>>> btnClose CLICADO - enviando APP_CLOSE IPC');

        try {
          // Enviar comando para main.js fechar a app
          if (this.ipc) {
            this.ipc.send('APP_CLOSE');
          } else {
            Logger.error('IPC não disponível para APP_CLOSE', {});
          }
        } catch (error) {
          Logger.error('Erro ao enviar APP_CLOSE', { error: error.message });
        }
      });
      Logger.debug('   ✅ Listener para btnClose registrado', false);
    } else {
      Logger.debug('   ⚠️ btnClose não encontrado', false);
    }
  }

  /**
   * Inicializa listeners do EventBus
   */
  #initEventBusListeners() {
    Logger.debug('🎯 WindowUIManager.#initEventBusListeners()', false);

    // Listener para evento de atualização de opacidade do EventBus
    if (globalThis.eventBus) {
      globalThis.eventBus.on('windowOpacityUpdate', (data) => {
        const opacityRange = DOM.get('opacityRange');
        if (opacityRange) {
          // Sincronizar o valor do input com o valor enviado pelo evento
          opacityRange.value = data.opacity;
          Logger.debug(`   📝 Opacidade sincronizada via EventBus: ${data.opacity}`, false);
        }
      });
      Logger.debug('   ✅ Listener para windowOpacityUpdate registrado', false);
    } else {
      Logger.debug('   ⚠️ EventBus não encontrado para registrar listeners', false);
    }
  }

  /**
   * Inicializa click-through controller
   */
  async initClickThroughController() {
    Logger.debug('🖱️ Inicializando click-through controller...', false);

    const btnToggleClick = DOM.get('btnToggleClick');

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
}

// Exportar classe para CommonJS
module.exports = WindowUIManager;

// Exportar para globalThis (para acesso via <script> tag)
if (typeof globalThis !== 'undefined') {
  globalThis.WindowUIManager = WindowUIManager;
}

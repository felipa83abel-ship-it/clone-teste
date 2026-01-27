// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * TopBarManager - Gerencia a barra superior (top bar) da aplicação
 *
 * Responsabilidades:
 *   - Opacidade do overlay (slider)
 *   - Modo de entrevista (select)
 *   - Badge de mock ativado
 *   - Badge de screenshots
 */
class TopBarManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('🔝 TopBarManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 TopBarManager.initialize()');
    this.#initListeners();
    this.#initElements();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo (opacidade, modo, etc)
   */
  async restoreState() {
    Logger.debug('TopBarManager.restoreState()');
    console.log('📂 TopBarManager.restoreState()');

    try {
      // Restaurar opacidade (se salva)
      const savedOpacity = this.configManager.config.ui?.opacity || 0.75;
      this.#updateOpacityUI(savedOpacity);
      this.applyOpacity(savedOpacity);

      // Restaurar modo de entrevista
      const savedMode = this.configManager.config.ui?.interviewMode || 'INTERVIEW';
      this.#updateModeUI(savedMode);
    } catch (error) {
      Logger.error('Erro ao restaurar estado TopBar', error);
    }
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    console.log('🔄 TopBarManager.reset()');
    this.configManager.config.ui = {
      opacity: 0.75,
      interviewMode: 'INTERVIEW',
    };
    this.#updateOpacityUI(0.75);
    this.#updateModeUI('INTERVIEW');
  }

  /**
   * Registra listeners de eventos do EventBus
   * ⚠️ CRÍTICO: Deve ser chamado ANTES de #initElements
   */
  #initListeners() {
    console.log('📡 TopBarManager #initListeners');

    // Listener para atualizar opacidade (sincronização bidirecional)
    this.eventBus.on('windowOpacityUpdate', (data) => {
      const opacity = data?.opacity ?? 0.75;
      this.#updateOpacityUI(opacity);
      console.log('✨ windowOpacityUpdate recebido:', opacity);
    });

    // Listener para atualizar modo selecionado
    this.eventBus.on('modeSelectUpdate', (data) => {
      const mode = data?.mode ?? 'INTERVIEW';
      this.#updateModeUI(mode);
      console.log('✨ modeSelectUpdate recebido:', mode);
    });

    // Listener para atualizar badge de screenshots
    this.eventBus.on('screenshotTaken', (data) => {
      const count = data?.count ?? 0;
      this.#updateScreenshotBadge(count);
      console.log('✨ screenshotTaken recebido:', count);
    });

    // Listener para mostrar/esconder badge de mock
    this.eventBus.on('mockModeToggled', (data) => {
      const enabled = data?.enabled ?? false;
      this.#updateMockBadge(enabled);
      console.log('✨ mockModeToggled recebido:', enabled);
    });
  }

  /**
   * Inicializa elementos DOM e seus listeners
   * ⚠️ CRÍTICO: Chamado DEPOIS de #initListeners
   */
  #initElements() {
    console.log('🎨 TopBarManager #initElements');

    const opacityRange = document.getElementById('opacityRange');
    const interviewModeSelect = document.getElementById('interviewModeSelect');

    // Opacidade: input listener
    if (opacityRange) {
      opacityRange.addEventListener('input', (e) => {
        const opacity = parseFloat(e.target.value);
        console.log('🎚️ opacityRange input:', opacity);

        // Salvar estado
        if (!this.configManager.config.ui) this.configManager.config.ui = {};
        this.configManager.config.ui.opacity = opacity;

        // Aplicar opacidade visual
        this.applyOpacity(opacity);

        // Emitir para sincronizar
        this.eventBus.emit('windowOpacityUpdate', { opacity });
      });

      // Change listener (quando mouse libera)
      opacityRange.addEventListener('change', (e) => {
        const opacity = parseFloat(e.target.value);
        console.log('🎚️ opacityRange change:', opacity);
        // Salvar estado persistente se necessário
      });
    }

    // Modo de entrevista: select listener
    if (interviewModeSelect) {
      interviewModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        console.log('📌 interviewModeSelect changed:', mode);

        // Salvar estado
        if (!this.configManager.config.ui) this.configManager.config.ui = {};
        this.configManager.config.ui.interviewMode = mode;

        // Emitir para sincronizar
        this.eventBus.emit('interviewModeChanged', { mode });
      });
    }
  }

  /**
   * Aplica opacidade real na janela (muda transparência)
   */
  applyOpacity(opacity) {
    try {
      // Aplica opacidade em elementos opacos (data-opaque="true")
      const opaqueElements = document.querySelectorAll('[data-opaque="true"]');
      opaqueElements.forEach((el) => {
        el.style.opacity = opacity;
      });

      // Também aplica no body como fallback
      const htmlElement = document.documentElement;
      if (htmlElement) {
        htmlElement.style.opacity = opacity;
      }

      console.log(`✨ Opacidade aplicada: ${(opacity * 100).toFixed(0)}%`);
    } catch (error) {
      console.error('❌ Erro ao aplicar opacidade:', error);
    }
  }

  /**
   * A

  /**
   * Atualiza slider de opacidade (UI)
   */
  #updateOpacityUI(opacity) {
    const opacityRange = document.getElementById('opacityRange');
    if (opacityRange) {
      opacityRange.value = opacity;
      console.log('💾 Opacidade atualizada:', opacity);
    }
  }

  /**
   * Atualiza select de modo (UI)
   */
  #updateModeUI(mode) {
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    if (interviewModeSelect) {
      interviewModeSelect.value = mode;
      console.log('💾 Modo atualizado:', mode);
    }
  }

  /**
   * Atualiza badge de screenshots
   */
  #updateScreenshotBadge(count) {
    const screenshotBadge = document.getElementById('screenshotBadge');
    if (screenshotBadge) {
      screenshotBadge.textContent = `📸 ${count} screenshots`;
      screenshotBadge.classList.toggle('hidden', count === 0);
      console.log('💾 Screenshot badge atualizado:', count);
    }
  }

  /**
   * Atualiza badge de mock
   */
  #updateMockBadge(enabled) {
    const mockBadge = document.getElementById('mockBadge');
    if (mockBadge) {
      mockBadge.classList.toggle('hidden', !enabled);
      console.log('💾 Mock badge atualizado:', enabled ? 'visível' : 'escondido');
    }
  }
}

// Exportar para globalThis (padrão do projeto)
if (typeof globalThis !== 'undefined') {
  globalThis.TopBarManager = TopBarManager;
}

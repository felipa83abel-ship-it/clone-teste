// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * AudioDeviceManager - Gerencia dispositivos de áudio
 *
 * Responsabilidades:
 *   - Carregar e enumerar dispositivos de áudio
 *   - Selecionar e persistir seleção
 *   - Iniciar/parar monitoramento de volume (VU meters)
 *   - Restaurar dispositivos salvos
 */
class AudioDeviceManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   * @param {RendererAPI} rendererAPI - API do renderer para audio
   */
  constructor(configManager, ipc, eventBus, rendererAPI) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
    this.rendererAPI = rendererAPI;

  }

  /**
   * Inicializa carregamento de dispositivos e listeners
   */
  async initialize() {
    await this.loadDevices();
    await this.restoreDevices();
    this.#initDeviceSelectListeners();
  }

  /**
   * Restaura estado salvo (dispositivos selecionados)
   */
  async restoreState() {
    await this.restoreDevices();
  }

  /**
   * Reseta tudo (limpa seleção de dispositivos)
   */
  async reset() {
    this.stopMonitoring('input');
    this.stopMonitoring('output');

    const inputSelect = document.getElementById('audio-input-device');
    const outputSelect = document.getElementById('audio-output-device');
    if (inputSelect) inputSelect.value = '';
    if (outputSelect) outputSelect.value = '';
    this.saveDevices();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Carrega e popula selects de dispositivos de áudio
   */
  async loadDevices() {
    Logger.debug('Início da função: "loadDevices"');
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');

      const inputSelect = document.getElementById('audio-input-device');
      const outputSelect = document.getElementById('audio-output-device');

      if (!inputSelect || !outputSelect) {
        console.warn('⚠️ Selects de áudio não encontrados no DOM');
        return;
      }

      // Limpa selects
      inputSelect.innerHTML = '';
      outputSelect.innerHTML = '';

      // Adiciona opção "Nenhum"
      this.#addNoneOption(inputSelect);
      this.#addNoneOption(outputSelect);

      // Popula com dispositivos disponíveis
      inputs.forEach((d, i) => {
        const label = d.label || `Dispositivo ${i + 1}`;

        const opt1 = new Option(`🎤 ${label}`, d.deviceId);
        const opt2 = new Option(`🎤 ${label}`, d.deviceId);

        inputSelect.appendChild(opt1);
        outputSelect.appendChild(opt2);
      });

    } catch (error) {
      console.error('❌ Erro ao carregar dispositivos de áudio:', error);
    }

    Logger.debug('Fim da função: "loadDevices"');
  }

  /**
   * Salva seleção atual de dispositivos
   */
  saveDevices() {
    Logger.debug('Início da função: "saveDevices"');
    const inputSelect = document.getElementById('audio-input-device');
    const outputSelect = document.getElementById('audio-output-device');

    if (inputSelect && outputSelect) {
      this.configManager.config.audio.inputDevice = inputSelect.value || '';
      this.configManager.config.audio.outputDevice = outputSelect.value || '';

      this.configManager.saveConfig();

        input: this.configManager.config.audio.inputDevice,
        output: this.configManager.config.audio.outputDevice,
      });

      // Emite evento
      this.eventBus.emit('AUDIO_DEVICE_UPDATED', {
        inputDevice: this.configManager.config.audio.inputDevice,
        outputDevice: this.configManager.config.audio.outputDevice,
      });
    }

    Logger.debug('Fim da função: "saveDevices"');
  }

  /**
   * Restaura seleção de dispositivos salvos
   */
  async restoreDevices() {
    Logger.debug('Início da função: "restoreDevices"');
    const inputSelect = document.getElementById('audio-input-device');
    const outputSelect = document.getElementById('audio-output-device');

    if (!inputSelect || !outputSelect) return;

    const savedInput = this.configManager.config.audio.inputDevice || '';
    const savedOutput = this.configManager.config.audio.outputDevice || '';

    // Verifica se o dispositivo salvo ainda existe nas opções
    const inputExists = [...inputSelect.options].some((o) => o.value === savedInput);
    const outputExists = [...outputSelect.options].some((o) => o.value === savedOutput);

    inputSelect.value = inputExists ? savedInput : '';
    outputSelect.value = outputExists ? savedOutput : '';

      input: inputSelect.value,
      output: outputSelect.value,
    });

    Logger.debug('Fim da função: "restoreDevices"');
  }

  /**
   * Inicia monitoramento de volume para um tipo de dispositivo
   * @param {string} type - 'input' ou 'output'
   */
  async startMonitoring(type) {
    Logger.debug(`Início da função: "startMonitoring" - ${type}`);
    const select = document.getElementById(`audio-${type}-device`);

    if (!select || !select.value) {
      return;
    }

    try {
      await this.rendererAPI?.startAudioVolumeMonitor(type, select.value);
    } catch (error) {
      console.error(`❌ Erro ao iniciar ${type} monitor:`, error);
    }

    Logger.debug(`Fim da função: "startMonitoring" - ${type}`);
  }

  /**
   * Para monitoramento de volume
   * @param {string} type - 'input' ou 'output'
   */
  stopMonitoring(type) {
    Logger.debug(`Início da função: "stopMonitoring" - ${type}`);
    this.rendererAPI?.stopAudioVolumeMonitor(type);
    Logger.debug(`Fim da função: "stopMonitoring" - ${type}`);
  }

  /**
   * Retorna dispositivos selecionados
   * @returns {{input: string, output: string}}
   */
  getSelectedDevices() {
    const inputSelect = document.getElementById('audio-input-device');
    const outputSelect = document.getElementById('audio-output-device');
    return {
      input: inputSelect?.value || '',
      output: outputSelect?.value || '',
    };
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Adiciona opção "Nenhum" ao select
   */
  #addNoneOption(select) {
    const opt = new Option('🔇 Nenhum (Desativado)', '');
    select.appendChild(opt);
  }

  /**
   * Registra listeners em selects de dispositivos
   */
  #initDeviceSelectListeners() {
    const inputSelect = document.getElementById('audio-input-device');
    const outputSelect = document.getElementById('audio-output-device');

    if (inputSelect) {
      inputSelect.addEventListener('change', async () => {
        this.saveDevices();

        // Para monitoramento antigo e inicia novo
        this.stopMonitoring('input');
        await this.startMonitoring('input');
      });
    }

    if (outputSelect) {
      outputSelect.addEventListener('change', async () => {
        this.saveDevices();

        // Para monitoramento antigo e inicia novo
        this.stopMonitoring('output');
        await this.startMonitoring('output');
      });
    }
  }
}

module.exports = AudioDeviceManager;

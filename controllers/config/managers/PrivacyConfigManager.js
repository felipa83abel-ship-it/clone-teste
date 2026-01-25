// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * PrivacyConfigManager - Gerencia configurações de privacidade
 *
 * Responsabilidades:
 *   - Hide from screen capture
 *   - Desativar telemetria
 *   - Auto-clear de dados
 *   - Retenção de dados
 */
class PrivacyConfigManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('🔒 PrivacyConfigManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 PrivacyConfigManager.initialize()');
    await this.restoreState();
    this.#initPrivacyListeners();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    console.log('📂 PrivacyConfigManager.restoreState()');
    this.restorePrivacyConfig();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    console.log('🔄 PrivacyConfigManager.reset()');
    this.configManager.config.privacy = {
      hideFromScreenCapture: false,
      disableTelemetry: false,
      autoClearData: false,
      dataRetentionDays: 7,
    };
    this.configManager.saveConfig(false);
    await this.restoreState();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Restaura configurações de privacidade salvas
   */
  restorePrivacyConfig() {
    Logger.debug('Início da função: "restorePrivacyConfig"');
    console.log('🔐 Restaurando configurações de privacidade...');

    // Restaurar checkbox: ocultar de screenshot
    const hideFromScreenCheckbox = document.getElementById('hide-from-screen-capture');
    if (hideFromScreenCheckbox) {
      hideFromScreenCheckbox.checked =
        this.configManager.config.privacy?.hideFromScreenCapture || false;
      console.log(`   ✅ Ocultar de screenshot: ${hideFromScreenCheckbox.checked ? 'Sim' : 'Não'}`);
    } else {
      console.warn('   ⚠️ Checkbox hide-from-screen-capture não encontrado');
    }

    // Restaurar checkbox: desabilitar telemetria
    const disableTelemetryCheckbox = document.getElementById('disable-telemetry');
    if (disableTelemetryCheckbox) {
      disableTelemetryCheckbox.checked =
        this.configManager.config.privacy?.disableTelemetry || false;
      console.log(
        `   ✅ Desabilitar telemetria: ${disableTelemetryCheckbox.checked ? 'Sim' : 'Não'}`
      );
    } else {
      console.warn('   ⚠️ Checkbox disable-telemetry não encontrado');
    }

    // Restaurar checkbox: auto-limpar dados
    const autoClearCheckbox = document.getElementById('auto-clear-data');
    if (autoClearCheckbox) {
      autoClearCheckbox.checked = this.configManager.config.privacy?.autoClearData || false;
      console.log(`   ✅ Auto-limpar dados: ${autoClearCheckbox.checked ? 'Sim' : 'Não'}`);
    } else {
      console.warn('   ⚠️ Checkbox auto-clear-data não encontrado');
    }

    // Restaurar slider: dias de retenção
    const retentionSlider = document.getElementById('data-retention-days');
    if (retentionSlider) {
      retentionSlider.value = this.configManager.config.privacy?.dataRetentionDays || 7;
      console.log(`   ✅ Dias de retenção: ${retentionSlider.value}`);
    } else {
      console.warn('   ⚠️ Slider data-retention-days não encontrado');
    }

    console.log('✅ Restauração concluída');
    Logger.debug('Fim da função: "restorePrivacyConfig"');
  }

  /**
   * Salva campo de privacidade
   * @param {string} field - Campo a salvar
   * @param {*} value - Novo valor
   */
  savePrivacyField(field, value) {
    Logger.debug('Início da função: "savePrivacyField"');
    console.log(`💾 Salvando ${field}: ${value}`);

    if (field === 'hide-from-screen-capture') {
      this.configManager.config.privacy.hideFromScreenCapture = value;
    } else if (field === 'disable-telemetry') {
      this.configManager.config.privacy.disableTelemetry = value;
    } else if (field === 'auto-clear-data') {
      this.configManager.config.privacy.autoClearData = value;
    } else if (field === 'data-retention-days') {
      this.configManager.config.privacy.dataRetentionDays = parseInt(value);
    }

    this.configManager.saveConfig();
    this.eventBus.emit('PRIVACY_CONFIG_CHANGED', { field, value });

    console.log(`   ✅ Campo ${field} salvo`);
    Logger.debug('Fim da função: "savePrivacyField"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de privacidade
   */
  #initPrivacyListeners() {
    console.log('🎯 PrivacyConfigManager.#initPrivacyListeners()');

    // Listener para checkbox: ocultar de screenshot
    const hideFromScreenCheckbox = document.getElementById('hide-from-screen-capture');
    if (hideFromScreenCheckbox) {
      hideFromScreenCheckbox.addEventListener('change', (e) => {
        this.savePrivacyField('hide-from-screen-capture', e.target.checked);
        console.log(`   📝 Ocultar de screenshot: ${e.target.checked ? 'Ativado' : 'Desativado'}`);
      });
      console.log('   ✅ Listener para hide-from-screen-capture registrado');
    } else {
      console.warn('   ⚠️ Checkbox hide-from-screen-capture não encontrado');
    }

    // Listener para checkbox: desabilitar telemetria
    const disableTelemetryCheckbox = document.getElementById('disable-telemetry');
    if (disableTelemetryCheckbox) {
      disableTelemetryCheckbox.addEventListener('change', (e) => {
        this.savePrivacyField('disable-telemetry', e.target.checked);
        console.log(`   📝 Telemetria: ${e.target.checked ? 'Desabilitada' : 'Habilitada'}`);
      });
      console.log('   ✅ Listener para disable-telemetry registrado');
    } else {
      console.warn('   ⚠️ Checkbox disable-telemetry não encontrado');
    }

    // Listener para checkbox: auto-limpar dados
    const autoClearCheckbox = document.getElementById('auto-clear-data');
    if (autoClearCheckbox) {
      autoClearCheckbox.addEventListener('change', (e) => {
        this.savePrivacyField('auto-clear-data', e.target.checked);
        console.log(`   📝 Auto-limpeza: ${e.target.checked ? 'Ativada' : 'Desativada'}`);
      });
      console.log('   ✅ Listener para auto-clear-data registrado');
    } else {
      console.warn('   ⚠️ Checkbox auto-clear-data não encontrado');
    }

    // Listener para slider: dias de retenção
    const retentionSlider = document.getElementById('data-retention-days');
    if (retentionSlider) {
      retentionSlider.addEventListener('change', (e) => {
        this.savePrivacyField('data-retention-days', e.target.value);
        console.log(`   📝 Retenção alterada: ${e.target.value} dias`);
      });
      console.log('   ✅ Listener para data-retention-days registrado');
    } else {
      console.warn('   ⚠️ Slider data-retention-days não encontrado');
    }
  }
}

module.exports = PrivacyConfigManager;

/**
 * UIElementsRegistry - Registro centralizado de elementos da UI
 *
 * Mantém referências de elementos DOM para evitar múltiplas queries
 * Pode ser facilmente mockado em testes
 */

class UIElementsRegistry {
  constructor() {
    this.elements = {};
  }

  /**
   * Registra elementos UI
   * @param {Object} elements - Objeto com referências de elementos
   *
   * Exemplo:
   * registry.register({
   *   micBtn: document.getElementById('mic-btn'),
   *   statusDiv: document.getElementById('status'),
   *   ...
   * })
   */
  register(elements) {
    if (!elements || typeof elements !== 'object') {
      console.warn('⚠️ UIElementsRegistry.register: argumento inválido');
      return;
    }

    this.elements = { ...this.elements, ...elements };
    console.log('✅ UI Elements registrados no UIElementsRegistry');
  }

  /**
   * Obtém elemento por chave
   */
  get(key) {
    return this.elements[key];
  }

  /**
   * Verifica se elemento existe
   */
  has(key) {
    return key in this.elements;
  }

  /**
   * Retorna todos os elementos registrados
   */
  getAll() {
    return { ...this.elements };
  }

  /**
   * Limpa registro (útil para testes)
   */
  clear() {
    this.elements = {};
  }
}

// Singleton global
const uiElementsRegistry = new UIElementsRegistry();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = uiElementsRegistry;
}

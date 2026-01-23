/* =========================================================
   CONFIG MANAGER
   Gerencia configurações da aplicação com persistência segura
========================================================= */

// Acesso ao ipcRenderer do processo renderer (nodeIntegration = true)
const _getIpcRenderer = () => {
	if (globalThis?.electron?.ipcRenderer) {
		return globalThis.electron.ipcRenderer;
	}
	if (typeof require === 'function') {
		return require('electron').ipcRenderer;
	}
	return null;
};

const _ipc = _getIpcRenderer();

// 🔥 NOVO: RendererAPI será definido globalmente após renderer.js carregar
// (não precisa fazer require pois renderer.js é carregado primeiro no index.html)
class ConfigManager {
	constructor() {
		debugLogConfig('Início da função: "constructor"');
		this.config = this.loadConfig();
		this.initEventListeners();

		debugLogConfig('Fim da função: "constructor"');
	}

	// Carrega configurações salvas
	loadConfig() {
		debugLogConfig('Início da função: "loadConfig"');
		console.log('📂 INICIANDO CARREGAMENTO DE CONFIG...');
		try {
			const defaultConfig = {
				api: {
					activeProvider: 'openai',
					openai: {
						// 🔥 MODIFICADO: Agora usa selectedSTTModel e selectedLLMModel
						selectedSTTModel: 'vosk',
						selectedLLMModel: 'gpt-4o-mini',
						enabled: true,
					},
					google: {
						// 🔥 MODIFICADO: Agora usa selectedSTTModel e selectedLLMModel
						selectedSTTModel: 'vosk',
						selectedLLMModel: 'gemini-pro',
						enabled: false,
					},
					openrouter: {
						// 🔥 MODIFICADO: Agora usa selectedSTTModel e selectedLLMModel
						selectedSTTModel: 'vosk',
						selectedLLMModel: '',
						enabled: false,
					},
					// custom: {
					// 	// 🔥 MODIFICADO: API key não é mais salva aqui
					// 	endpoint: '',
					// 	selectedSTTModel: '',
					// 	selectedLLMModel: '',
					// 	enabled: false,
					// },
				},
				audio: {
					inputDevice: '',
					outputDevice: '',
					autoDetect: true,
				},
				screen: {
					screenshotHotkey: 'Ctrl+Shift+S',
					excludeAppFromScreenshot: true,
					imageFormat: 'png',
				},
				privacy: {
					hideFromScreenCapture: false,
					disableTelemetry: false,
					autoClearData: false,
					dataRetentionDays: 7,
				},
				other: {
					language: 'pt-BR',
					theme: 'auto',
					autoUpdate: true,
					logLevel: 'info',
					darkMode: false,
					interviewMode: 'INTERVIEW',
					overlayOpacity: 0.75,
				},
			};

			const saved = localStorage.getItem('appConfig');
			console.log(
				`🔍 localStorage.getItem('appConfig'): ${saved ? 'ENCONTRADO (' + saved.length + ' bytes)' : 'NÃO ENCONTRADO'}`,
			);
			if (saved) {
				const parsed = JSON.parse(saved);
				console.log('📂 Configurações encontradas no localStorage');
				console.log('   OpenAI STT:', parsed.api?.openai?.selectedSTTModel);
				console.log('   Google STT:', parsed.api?.google?.selectedSTTModel);
				console.log('   OpenRouter STT:', parsed.api?.openrouter?.selectedSTTModel);
				// 🔥 Merge profundo para preservar estados salvos
				const merged = { ...defaultConfig };
				if (parsed.api) {
					merged.api = { ...defaultConfig.api, ...parsed.api };
					// Preserva o estado enabled de cada provider
					Object.keys(defaultConfig.api).forEach(provider => {
						if (parsed.api[provider] && typeof parsed.api[provider] === 'object') {
							merged.api[provider] = {
								...defaultConfig.api[provider],
								...parsed.api[provider],
							};
						}
					});
				}
				if (parsed.audio) merged.audio = { ...defaultConfig.audio, ...parsed.audio };
				if (parsed.screen) merged.screen = { ...defaultConfig.screen, ...parsed.screen };
				if (parsed.privacy) merged.privacy = { ...defaultConfig.privacy, ...parsed.privacy };
				if (parsed.other) merged.other = { ...defaultConfig.other, ...parsed.other };

				console.log('✅ Configurações carregadas do localStorage');

				debugLogConfig('Fim da função: "loadConfig"');
				return merged;
			}

			console.log('✅ Configurações default carregadas');

			debugLogConfig('Fim da função: "loadConfig"');
			return defaultConfig;
		} catch (error) {
			console.error('Erro ao carregar configurações:', error);
			return this.getDefaultConfig();
		}
	}

	// Inicializa listeners de eventos
	initEventListeners() {
		debugLogConfig('Início da função: "initEventListeners"');
		// Menu lateral
		document.querySelectorAll('.menu-item').forEach(item => {
			item.addEventListener('click', e => {
				const tab = e.currentTarget.dataset.tab;
				this.switchConfigSection(tab);
			});
		});

		// Tabs dentro das seções
		document.querySelectorAll('.tab-button').forEach(button => {
			button.addEventListener('click', e => {
				const tabId = e.currentTarget.dataset.tab;
				this.switchTab(tabId);
			});
		});

		// Botões de ativar/desativar modelo - agora usa seletor mais específico
		document.querySelectorAll('button[data-model]').forEach(button => {
			button.addEventListener('click', e => {
				const model = e.currentTarget.dataset.model;
				this.toggleModel(model);
			});
		});

		// Botões de salvar
		document.querySelectorAll('.btn-save').forEach(button => {
			button.addEventListener('click', e => {
				const section = e.currentTarget.dataset.section;
				this.saveSection(section);
			});
		});

		// 🔥 NOVO: Botões de deletar API key
		document.querySelectorAll('.btn-delete-api-key').forEach(button => {
			button.addEventListener('click', e => {
				const provider = e.currentTarget.dataset.provider;
				this.deleteApiKey(provider);
			});
		});

		// 🔥 CORRIGIDO: Campos de API key - comportamento ao focar
		document.querySelectorAll('.api-key-input').forEach(input => {
			// 🔥 Ao digitar (input event), marca campo como tendo conteúdo
			input.addEventListener('input', e => {
				const hasContent = e.target.value && e.target.value.trim().length > 0;
				if (hasContent && !e.target.value.includes('••••')) {
					// Usuário está digitando uma nova chave - manter visível
					e.target.type = 'text';
				}
			});

			// 🔥 Quando o campo recebe foco
			input.addEventListener('focus', async e => {
				const hasKey = e.target.dataset.hasKey === 'true';
				const isMasked = e.target.type === 'password';
				if (hasKey && isMasked) {
					// 🔥 OPÇÃO 1: Limpa para permitir nova chave
					e.target.value = '';
					e.target.type = 'text'; // 🔥 NOVO: Inicia em texto para não mascarar entrada
					e.target.placeholder = 'Insira uma nova API key';
					console.log(`📝 Campo limpo para edição - provider: ${e.target.id}`);
				} else if (!hasKey && e.target.value === '') {
					// 🔥 NOVO: Campo vazio sem chave salva - inicia em texto para entrada clara
					e.target.type = 'text';
				}
			});

			// 🔥 Ao sair do campo sem alterar, restaura máscara
			input.addEventListener('blur', e => {
				const hasKey = e.target.dataset.hasKey === 'true';
				const isEmpty = e.target.value === '' || e.target.value.trim() === '';

				if (hasKey && isEmpty) {
					// 🔥 Usuário cancelou edição - restaura máscara
					e.target.value = '••••••••••••••••••••••••••';
					e.target.type = 'password';
					e.target.placeholder = 'API key configurada (clique para alterar)';
					console.log(`🔒 Máscara restaurada após cancelamento`);
				} else if (!isEmpty && !hasKey && e.target.value.length > 0 && !e.target.value.includes('••••')) {
					// 🔥 NOVO: Usuário digitou uma nova chave - manter visível até salvar
					console.log(`📝 Novo valor digitado - aguardando salvar`);
				}
			});

			// Previne copiar valor mascarado
			input.addEventListener('copy', e => {
				if (e.target.value.includes('••••')) {
					e.preventDefault();
					this.showError('Não é possível copiar API key mascarada');
				}
			});

			// Previne cortar valor mascarado
			input.addEventListener('cut', e => {
				if (e.target.value.includes('••••')) {
					e.preventDefault();
					this.showError('Não é possível cortar API key mascarada');
				}
			});
		});

		// 🔥 CORRIGIDO: Toggle visibilidade de API keys
		document.querySelectorAll('.btn-toggle-visibility').forEach(button => {
			button.addEventListener('click', async e => {
				e.preventDefault();
				e.stopPropagation();

				const targetId = e.currentTarget.dataset.target;
				const input = document.getElementById(targetId);
				const button = e.currentTarget;

				if (!input) {
					console.warn(`⚠️ Input ${targetId} não encontrado`);
					return;
				}

				const provider = targetId.replace('-api-key', ''); // 'openai-api-key' -> 'openai'
				const hasKey = input.dataset.hasKey === 'true';
				const isMasked = input.value.includes('•');
				const hasNewValue = input.value && input.value.trim().length > 0 && !isMasked;

				// 🔥 CASO 1: Campo tem chave salva E está mascarado → busca do store
				if (hasKey && isMasked) {
					try {
						const realKey = await _ipc.invoke('GET_API_KEY', provider);

						if (realKey) {
							input.value = realKey;
							input.type = 'text';
							button.innerHTML = '<span class="material-icons">visibility_off</span>';
							console.log(`👁️ Mostrando chave salva de ${provider}`);
						} else {
							console.warn(`⚠️ Chave de ${provider} não encontrada no store`);
						}
					} catch (error) {
						console.error(`❌ Erro ao recuperar chave de ${provider}:`, error);
					}
				}
				// 🔥 CASO 2: Usuário está digitando uma chave nova (visível, sem •) → mascara
				else if (hasNewValue && input.type === 'text') {
					input.type = 'password';
					button.innerHTML = '<span class="material-icons">visibility</span>';
					console.log(`🔒 Ocultando chave digitada`);
				}
				// 🔥 CASO 3: Chave nova está mascarada → mostra novamente
				else if (hasNewValue && input.type === 'password') {
					input.type = 'text';
					button.innerHTML = '<span class="material-icons">visibility_off</span>';
					console.log(`👁️ Mostrando chave digitada`);
				}
				// 🔥 CASO 4: Campo vazio ou mascara de placeholder → não faz nada
				else {
					console.log(`⚠️ Campo em estado indefinido - ignorando clique`);
				}
			});
		});

		// Botões de ação
		document.querySelector('.btn-export-config')?.addEventListener('click', () => this.exportConfig());
		document.querySelector('.btn-import-config')?.addEventListener('click', () => this.importConfig());
		document.querySelector('.btn-reset-config')?.addEventListener('click', () => this.resetConfig());

		// Inputs que salvam automaticamente
		// 🔥 EXCLUDENDO: opacityRange (gerenciado separadamente em initEventListeners)
		// 🔥 EXCLUDENDO: mockToggle (estado temporário de DEBUG - não deve ser persistido)
		document.querySelectorAll('input, select, textarea').forEach(input => {
			if (input.id && !input.classList.contains('api-key-input') && input.id !== 'mockToggle') {
				input.addEventListener('change', async () => {
					// 🔥 CORRIGIDO: Para checkboxes, usar .checked em vez de .value
					const value = input.type === 'checkbox' ? input.checked : input.value;
					this.saveField(input.id, value);
					this.saveConfig(); // 🔥 CRÍTICO: Salva configuração para persistir mudanças

					// 🔥 NOVO: Se foi mudança de dispositivo de áudio, usa novo módulo
					if (input.id === 'audio-input-device') {
						console.log('📝 Input device mudou para:', input.value || 'NENHUM');

						// 🔥 Troca dispositivo no monitor de volume (com await!)
						await globalThis.RendererAPI?.switchAudioVolumeDevice('input', input.value);

						// Emite evento para STT modules se estiverem em uso (renderer fica cego ao DOM)
						if (globalThis.RendererAPI?.emitUIChange) {
							globalThis.RendererAPI.emitUIChange('onAudioDeviceChanged', { type: 'input', deviceId: input.value });
						}
					} else if (input.id === 'audio-output-device') {
						console.log('📝 Output device mudou para:', input.value || 'NENHUM');

						// 🔥 Troca dispositivo no monitor de volume (com await!)
						await globalThis.RendererAPI?.switchAudioVolumeDevice('output', input.value);

						// Emite evento para STT modules se estiverem em uso (renderer fica cego ao DOM)
						if (globalThis.RendererAPI?.emitUIChange) {
							globalThis.RendererAPI.emitUIChange('onAudioDeviceChanged', { type: 'output', deviceId: input.value });
						}
					} else if (input.id === 'darkModeToggle') {
						// 🔥 NOVO: Aplica classe CSS quando darkModeToggle muda
						const isDark = input.checked;
						document.body.classList.toggle('dark', isDark);
						console.log('🌙 Dark mode toggled:', isDark);
					}
				});
			}
		});

		// 🔥 NOVO: Inicializa slider de opacidade (listener apenas, restauração em restoreUserPreferences)
		const opacityRange = document.getElementById('opacityRange');
		if (opacityRange) {
			opacityRange.addEventListener('input', e => {
				this.saveField('opacityRange', e.target.value);
				this.applyOpacity(e.target.value);
			});
		}

		// 🔥 NOVO: Inicializar listener do botão reset
		this.initResetButtonListener();

		console.log('✅ Listeners de eventos inicializados');

		debugLogConfig('Fim da função: "initEventListeners"');
	}

	// Helper to restart input monitoring
	restartInputMonitoring() {
		setTimeout(() => {
			if (globalThis.RendererAPI?.startInputVolumeMonitoring) {
				globalThis.RendererAPI.startInputVolumeMonitoring().catch(err => {
					console.error('❌ Erro ao reiniciar monitoramento input:', err);
				});
			}
		}, 150);
	}

	// Helper to restart output monitoring
	restartOutputMonitoring() {
		setTimeout(() => {
			if (globalThis.RendererAPI?.startOutputVolumeMonitoring) {
				globalThis.RendererAPI.startOutputVolumeMonitoring().catch(err => {
					console.error('❌ Erro ao reiniciar monitoramento output:', err);
				});
			}
		}, 150);
	}

	// Helper to find target placeholder
	findTargetPlaceholder(data, transcriptionBox) {
		const { placeholderId } = data;
		let targetPlaceholder = null;

		if (placeholderId) {
			// Buscar placeholder pelo ID
			targetPlaceholder = document.getElementById(placeholderId);
			if (targetPlaceholder) {
				debugLogConfig('✅ Placeholder encontrado por ID:', placeholderId, false);
			} else {
				console.warn('⚠️ Placeholder com ID não encontrado:', placeholderId);
				// Fallback: busca pelo selector de data-is-placeholder
				const placeholders = transcriptionBox.querySelectorAll('[data-is-placeholder="true"]');
				if (placeholders.length > 0) {
					targetPlaceholder = placeholders[placeholders.length - 1];
					console.log('📍 Usando FALLBACK: último placeholder');
				}
			}
		} else {
			// Sem ID (compatibilidade), usa o último
			const placeholders = transcriptionBox.querySelectorAll('[data-is-placeholder="true"]');
			if (placeholders.length > 0) {
				targetPlaceholder = placeholders[placeholders.length - 1];
				console.log('📍 ID não fornecido, usando último placeholder');
			}
		}

		return targetPlaceholder;
	}

	// 🔥 NOVO: Verifica status das API keys de todos os providers
	async checkApiKeysStatus() {
		debugLogConfig('Início da função: "checkApiKeysStatus"');
		try {
			const providers = ['openai', 'google', 'openrouter'];

			for (const provider of providers) {
				// 🔥 CORRIGIDO: Aguarda a promessa corretamente
				const savedKey = await _ipc.invoke('GET_API_KEY', provider);

				console.log(`🔍 Verificando ${provider}:`, savedKey ? 'KEY_EXISTS' : 'NO_KEY');

				if (savedKey && typeof savedKey === 'string' && savedKey.length > 10) {
					console.log(`✅ Chave de ${provider} carregada com sucesso (length: ${savedKey.length})`);
					this.updateApiKeyFieldStatus(provider, true);
				} else {
					console.log(`⚠️ Nenhuma chave salva para ${provider}`);
					this.updateApiKeyFieldStatus(provider, false);

					// 🔥 NOVO: Desativa modelo se não houver chave
					if (this.config.api[provider]) {
						this.config.api[provider].enabled = false;
					}
				}
			}

			// 🔥 NOVO: Não força ativação automática - respeita preferência salva do usuário
			console.log('✅ Verificação de API keys concluída');
		} catch (error) {
			console.error('❌ Erro ao verificar status das API keys:', error);
		}

		debugLogConfig('Fim da função: "checkApiKeysStatus"');
	}

	updateApiKeyFieldStatus(provider, hasKey) {
		debugLogConfig('Início da função: "updateApiKeyFieldStatus"');
		const input = document.getElementById(`${provider}-api-key`);

		if (input) {
			if (hasKey) {
				// 🔥 CORRIGIDO: Mostra como configurada (mascarada)
				input.value = '••••••••••••••••••••••••••';
				input.dataset.hasKey = 'true';
				input.placeholder = 'API key configurada (clique para alterar)';
				input.type = 'password'; // 🔥 Garante que inicie mascarado

				console.log(`🔐 Campo ${provider}-api-key configurado como MASCARADO`);
			} else {
				// 🔥 CORRIGIDO: Mostra como vazia
				input.value = '';
				input.dataset.hasKey = 'false';
				input.placeholder = 'Insira sua API key';
				input.type = 'password';

				console.log(`🔓 Campo ${provider}-api-key configurado como VAZIO`);
			}
		} else {
			console.warn(`⚠️ Input ${provider}-api-key não encontrado no DOM`);
		}

		debugLogConfig('Fim da função: "updateApiKeyFieldStatus"');
	}

	// 🔥 NOVO: Salva API key de forma segura
	async saveApiKey(provider, apiKey) {
		debugLogConfig('Início da função: "saveApiKey"');
		try {
			// 🔥 CRÍTICO: Valida que a chave não está vazia
			if (!apiKey || apiKey.trim().length < 10) {
				console.warn('---> API key inválida ou muito curta');
				this.showError('API key inválida');
				return { success: false, error: 'API key inválida' };
			}

			// 🔥 DEBUG: Log da chave ANTES de enviar ao main (masked)
			const trimmedKey = apiKey.trim();
			console.log(`Enviando para main.js - provider: ${provider}, key length: ${trimmedKey.length}`);
			const masked = trimmedKey ? trimmedKey.substring(0, 8) + '...' : '';
			console.log(`Chave (masked): ${masked}`);

			// Salva a chave de forma segura
			await _ipc.invoke('SAVE_API_KEY', {
				provider,
				apiKey: trimmedKey, // 🔥 Garante que envia trimmed
			});

			console.log(`API key de ${provider} salva com sucesso`);
			this.updateApiKeyFieldStatus(provider, true);
			this.showSaveFeedback(`API key de ${provider} salva com segurança`);

			debugLogConfig('Fim da função: "saveApiKey"');
			return { success: true };
		} catch (error) {
			console.error(`Erro ao salvar API key de ${provider}:`, error);
			this.showError(`Erro ao salvar API key: ${error.message}`);
			return { success: false, error: error.message };
		}
	}

	// 🔥 NOVO: Remove API key de forma segura
	async deleteApiKey(provider) {
		debugLogConfig('Início da função: "deleteApiKey"');
		try {
			const confirmed = confirm(`Tem certeza que deseja remover a API key de ${provider}?`);

			if (!confirmed) return;

			const result = await _ipc?.invoke('DELETE_API_KEY', provider);

			if (result?.success) {
				console.log(`✅ API key de ${provider} removida com sucesso`);
				this.updateApiKeyFieldStatus(provider, false);

				// 🔥 NOVO: Se o modelo estava ativo, desativa automaticamente
				if (this.config.api[provider]?.enabled === true) {
					console.log(`🔴 Desativando modelo ${provider} pois sua chave foi removida`);
					this.config.api[provider].enabled = false;
					this.config.api.activeProvider = null; // Limpa provider ativo
					this.updateModelStatusUI();
					this.saveConfig();
					this.showSaveFeedback(`API key de ${provider} removida - Modelo desativado`);
				} else {
					this.showSaveFeedback(`API key de ${provider} removida`);
				}
			} else {
				this.showError(`Erro ao remover API key de ${provider}`);
			}
		} catch (error) {
			console.error(`❌ Erro ao remover API key de ${provider}:`, error);
			this.showError(`Erro ao remover API key: ${error.message}`);
		}

		debugLogConfig('Fim da função: "deleteApiKey"');
	}

	// Salva configurações
	saveConfig() {
		debugLogConfig('Início da função: "saveConfig"');
		try {
			const configStr = JSON.stringify(this.config);
			localStorage.setItem('appConfig', configStr);
			console.log('💾 Configurações salvas com sucesso');
			console.log('   OpenAI STT:', this.config.api.openai.selectedSTTModel);
			console.log('   Google STT:', this.config.api.google.selectedSTTModel);
			console.log('   OpenRouter STT:', this.config.api.openrouter.selectedSTTModel);
			this.showSaveFeedback();
		} catch (error) {
			console.error('❌ Erro ao salvar configurações:', error);
			this.showError('Erro ao salvar configurações');
		}

		debugLogConfig('Fim da função: "saveConfig"');
	}

	// 🔥 Sincroniza API key ao iniciar
	async syncApiKeyOnStart() {
		debugLogConfig('Início da função: "syncApiKeyOnStart"');
		try {
			const statusText = document.getElementById('status');
			const openaiKey = await _ipc.invoke('GET_API_KEY', 'openai');

			if (openaiKey && openaiKey.length > 10) {
				console.log('✅ Chave OpenAI encontrada - cliente inicializado');
				if (statusText) statusText.innerText = 'Status: pronto';
				await _ipc.invoke('initialize-api-client', openaiKey);
			} else {
				console.warn('⚠️ Nenhuma chave OpenAI configurada');
				if (statusText) statusText.innerText = 'Status: aguardando configuração de API';
			}
		} catch (error) {
			console.error('❌ Erro ao sincronizar API key:', error);
		}

		debugLogConfig('Fim da função: "syncApiKeyOnStart"');
	}

	showSaveFeedback() {
		debugLogConfig('Início da função: "showSaveFeedback"');
		const feedback = document.createElement('div');
		feedback.className = 'save-feedback';
		feedback.innerHTML = `
            <span class="material-icons">check_circle</span>
            Configurações salvas com sucesso!
        `;
		document.body.appendChild(feedback);

		setTimeout(() => {
			feedback.remove();
		}, 3000);

		debugLogConfig('Fim da função: "showSaveFeedback"');
	}

	// Mostra erro
	showError(message) {
		debugLogConfig('Início da função: "showError"');
		const error = document.createElement('div');
		error.className = 'save-feedback';
		error.style.background = '#dc3545';
		error.innerHTML = `
            <span class="material-icons">error</span>
            ${message}
        `;
		document.body.appendChild(error);

		setTimeout(() => {
			error.remove();
		}, 3000);

		debugLogConfig('Fim da função: "showError"');
	}

	// Carrega dispositivos de áudio disponíveis
	async loadDevices() {
		debugLogConfig('Início da função: "loadDevices"');
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const inputs = devices.filter(d => d.kind === 'audioinput');

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
			this.addNoneOption(inputSelect);
			this.addNoneOption(outputSelect);

			// Popula com dispositivos disponíveis
			inputs.forEach((d, i) => {
				const label = d.label || `Dispositivo ${i + 1}`;

				const opt1 = new Option(`🎤 ${label}`, d.deviceId);
				const opt2 = new Option(`🎤 ${label}`, d.deviceId);

				inputSelect.appendChild(opt1);
				outputSelect.appendChild(opt2);
			});

			console.log('✅ Dispositivos de áudio carregados:', inputs.length);
		} catch (error) {
			console.error('❌ Erro ao carregar dispositivos de áudio:', error);
		}

		debugLogConfig('Fim da função: "loadDevices"');
	}

	// Adiciona opção "Nenhum" ao select
	addNoneOption(select) {
		const opt = new Option('🔇 Nenhum (Desativado)', '');
		select.appendChild(opt);
	}

	// Salva dispositivos selecionados
	saveDevices() {
		debugLogConfig('Início da função: "saveDevices"');
		const inputSelect = document.getElementById('audio-input-device');
		const outputSelect = document.getElementById('audio-output-device');

		if (inputSelect && outputSelect) {
			this.config.audio.inputDevice = inputSelect.value || '';
			this.config.audio.outputDevice = outputSelect.value || '';

			// Salva no localStorage via método padrão
			this.saveConfig();

			console.log('💾 Dispositivos salvos:', {
				input: this.config.audio.inputDevice,
				output: this.config.audio.outputDevice,
			});
		}

		debugLogConfig('Fim da função: "saveDevices"');
	}

	// Restaura dispositivos salvos
	restoreDevices() {
		debugLogConfig('Início da função: "restoreDevices"');
		const inputSelect = document.getElementById('audio-input-device');
		const outputSelect = document.getElementById('audio-output-device');

		if (!inputSelect || !outputSelect) return;

		const savedInput = this.config.audio.inputDevice || '';
		const savedOutput = this.config.audio.outputDevice || '';

		// Verifica se o dispositivo salvo ainda existe nas opções
		const inputExists = [...inputSelect.options].some(o => o.value === savedInput);
		const outputExists = [...outputSelect.options].some(o => o.value === savedOutput);

		inputSelect.value = inputExists ? savedInput : '';
		outputSelect.value = outputExists ? savedOutput : '';

		console.log('🔄 Dispositivos restaurados:', {
			input: inputSelect.value,
			output: outputSelect.value,
		});

		debugLogConfig('Fim da função: "restoreDevices"');
	}

	// 🔥 NOVO: Restaura modelos STT e LLM salvos
	restoreSTTLLMModels() {
		debugLogConfig('Início da função: "restoreSTTLLMModels"');
		console.log('🔄 INICIANDO RESTAURAÇÃO DE MODELOS STT/LLM...');
		const providers = ['openai', 'google', 'openrouter'];

		providers.forEach(provider => {
			// Restaurar STT Model
			const sttSelectId = `${provider}-stt-model`;
			const sttSelect = document.getElementById(sttSelectId);
			const savedSTTModel = this.config.api[provider]?.selectedSTTModel || 'vosk';

			if (sttSelect) {
				console.log(`   📝 ${sttSelectId}: antes="${sttSelect.value}" → depois="${savedSTTModel}"`);
				sttSelect.value = savedSTTModel;
				console.log(`   ✅ STT restaurado - ${provider}: ${savedSTTModel}`);
			} else {
				console.log(`   ⚠️ Select ${sttSelectId} não encontrado no DOM`);
			}

			// Restaurar LLM Model
			const llmSelectId = `${provider}-llm-model`;
			const llmSelect = document.getElementById(llmSelectId);
			const savedLLMModel = this.config.api[provider]?.selectedLLMModel || '';

			if (llmSelect) {
				console.log(`   📝 ${llmSelectId}: antes="${llmSelect.value}" → depois="${savedLLMModel}"`);
				llmSelect.value = savedLLMModel;
				console.log(`   ✅ LLM restaurado - ${provider}: ${savedLLMModel}`);
			} else {
				console.log(`   ⚠️ Select ${llmSelectId} não encontrado no DOM`);
			}
		});

		console.log('🎉 RESTAURAÇÃO CONCLUÍDA');
		debugLogConfig('Fim da função: "restoreSTTLLMModels"');
	}

	// 🔥 NOVO: Restaura preferências do usuário (darkMode, interviewMode, overlayOpacity)
	restoreUserPreferences() {
		debugLogConfig('Início da função: "restoreUserPreferences"');
		console.log('🔄 RESTAURANDO PREFERÊNCIAS DO USUÁRIO...');

		// 1️⃣ Restaurar Dark Mode
		const darkModeToggle = document.getElementById('darkModeToggle');
		const savedDarkMode = this.config.other?.darkMode ?? false;
		if (darkModeToggle) {
			darkModeToggle.checked = savedDarkMode;
			console.log(`   ✅ Dark Mode restaurado: ${savedDarkMode ? 'ATIVADO' : 'DESATIVADO'}`);
		} else {
			console.warn('   ⚠️ darkModeToggle não encontrado no DOM');
		}

		// 2️⃣ Restaurar Interview Mode
		const interviewModeSelect = document.getElementById('interviewModeSelect');
		const savedInterviewMode = this.config.other?.interviewMode ?? 'INTERVIEW';
		if (interviewModeSelect) {
			interviewModeSelect.value = savedInterviewMode;
			console.log(`   ✅ Interview Mode restaurado: ${savedInterviewMode}`);
		} else {
			console.warn('   ⚠️ interviewModeSelect não encontrado no DOM');
		}

		// 3️⃣ Restaurar Opacity
		const opacityRange = document.getElementById('opacityRange');
		const savedOpacity = this.config.other?.overlayOpacity ?? 0.75;
		if (opacityRange) {
			opacityRange.value = savedOpacity;
			this.applyOpacity(savedOpacity);
			console.log(`   ✅ Opacidade restaurada: ${savedOpacity}`);
		} else {
			console.warn('   ⚠️ opacityRange não encontrado no DOM');
		}

		console.log('🎉 PREFERÊNCIAS RESTAURADAS COM SUCESSO');
		debugLogConfig('Fim da função: "restoreUserPreferences"');
	}

	// Alterna entre seções de configuração
	switchConfigSection(sectionId) {
		debugLogConfig(`Início da função: "switchConfigSection" para sectionId: "${sectionId}"`);

		// 1. Remove classes ativas de todos os itens de menu e seções (Lógica original)
		document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
		document.querySelectorAll('.config-section').forEach(s => s.classList.remove('active'));

		// 2. Ativa o item e a seção clicada (Lógica original)
		const menuItem = document.querySelector(`.menu-item[data-tab="${sectionId}"]`);
		const section = document.getElementById(sectionId);
		if (menuItem) menuItem.classList.add('active');
		if (section) section.classList.add('active');

		// Parar o monitoramento ao sair da aba para economizar recursos
		this.stopAudioMonitoring();

		if (sectionId === 'api-models') {
			this.switchTab('openai'); // Garante que a aba OpenAI seja padrão
		} else if (sectionId === 'audio-screen') {
			this.switchTab('audio-config');
			// 🔥 NOVO: Inicia monitoramento APENAS se entrar na aba de áudio
			this.initAudioMonitoring();
		}

		debugLogConfig('Fim da função: "switchConfigSection"');
	}

	// Criamos um método auxiliar para organizar o código
	async initAudioMonitoring() {
		debugLogConfig('Início da função: "initAudioMonitoring"');

		const inputSelect = document.getElementById('audio-input-device');
		const outputSelect = document.getElementById('audio-output-device');

		console.log('📊 [initAudioMonitoring] Estado dos dispositivos:');
		console.log(
			`   Input: valor="${inputSelect?.value || 'VAZIO'}", text="${inputSelect?.options[inputSelect?.selectedIndex]?.text || 'N/A'}"`,
		);
		console.log(
			`   Output: valor="${outputSelect?.value || 'VAZIO'}", text="${outputSelect?.options[outputSelect?.selectedIndex]?.text || 'N/A'}"`,
		);

		// 🔥 CRÍTICO: Ambos DEVEM iniciar INDEPENDENTEMENTE se tiverem dispositivo selecionado
		const promises = [];

		// Input
		if (inputSelect?.value && inputSelect.value !== '') {
			console.log('📊 [Tab Audio] Iniciando monitoramento VOLUME (INPUT):', inputSelect.value);
			promises.push(
				globalThis.RendererAPI?.startAudioVolumeMonitor('input', inputSelect.value)
					.then(() => console.log('✅ Input monitor iniciado'))
					.catch(err => console.error('❌ Erro ao iniciar input monitor:', err)),
			);
		} else {
			console.log('ℹ️ Input: nenhum dispositivo selecionado (DESATIVADO)');
		}

		// Output
		if (outputSelect?.value && outputSelect.value !== '') {
			console.log('📊 [Tab Audio] Iniciando monitoramento VOLUME (OUTPUT):', outputSelect.value);
			promises.push(
				globalThis.RendererAPI?.startAudioVolumeMonitor('output', outputSelect.value)
					.then(() => console.log('✅ Output monitor iniciado'))
					.catch(err => console.error('❌ Erro ao iniciar output monitor:', err)),
			);
		} else {
			console.log('ℹ️ Output: nenhum dispositivo selecionado (DESATIVADO)');
		}

		// Aguarda AMBOS (se houver)
		if (promises.length > 0) {
			await Promise.all(promises);
			console.log(`✅ Monitoramento de volume inicializado (${promises.length} dispositivo(s))`);
		} else {
			console.log('ℹ️ Nenhum dispositivo de áudio ativado para monitoramento');
		}

		debugLogConfig('Fim da função: "initAudioMonitoring"');
	}

	// Método opcional para desligar os medidores ao sair da aba
	stopAudioMonitoring() {
		// 🔥 NOVO: Usa novo módulo audio-volume-monitor.js via RendererAPI
		console.log('🛑 [stopAudioMonitoring] Parando monitoramento de AMBOS (input + output)');
		globalThis.RendererAPI?.stopAudioVolumeMonitor('input');
		globalThis.RendererAPI?.stopAudioVolumeMonitor('output');
		console.log('✅ Monitoramento parado');
	}

	// Alterna entre tabs
	switchTab(tabId) {
		debugLogConfig('Início da função: "switchTab"');
		// Remove classe active de todos os botões
		document.querySelectorAll('.tab-button').forEach(button => {
			button.classList.remove('active');
		});

		// Adiciona classe active ao botão clicado
		document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');

		// Oculta todos os painéis
		document.querySelectorAll('.tab-pane').forEach(pane => {
			pane.classList.remove('active');
		});

		// Mostra o painel selecionado
		document.getElementById(tabId).classList.add('active');

		debugLogConfig('Fim da função: "switchTab"');
	}

	async toggleModel(model) {
		debugLogConfig('Início da função: "toggleModel"');
		// 🔥 NOVO: Detecta se é ativação ou desativação
		const isCurrentlyActive = this.config.api[model]?.enabled === true;

		try {
			if (isCurrentlyActive) {
				// 🔥 DESATIVAÇÃO: Permite sempre, sem exigir chave
				this.config.api[model].enabled = false;

				console.log(`✅ Modelo ${model} desativado com sucesso`);
				this.showSaveFeedback(`Modelo ${model} desativado`);
				this.updateModelStatusUI();
				this.saveConfig();
				return;
			}

			// 🔥 ATIVAÇÃO: Exige chave válida
			const savedKey = await _ipc.invoke('GET_API_KEY', model);

			if (!savedKey || savedKey.length < 10) {
				console.log(`⚠️ Não é possível ativar o modelo ${model} sem chave válida`);
				this.showError(`Configure a API key de ${model} antes de ativar`);
				return;
			}

			// 🔥 NOVO: Desativa todos os outros modelos primeiro
			Object.keys(this.config.api).forEach(key => {
				if (key !== 'activeProvider' && this.config.api[key] && typeof this.config.api[key] === 'object') {
					this.config.api[key].enabled = false;
				}
			});

			// 🔥 NOVO: Ativa o modelo selecionado
			if (this.config.api[model]) {
				this.config.api[model].enabled = true;
				this.config.api.activeProvider = model;

				console.log(`✅ Modelo ${model} ativado com sucesso`);
				this.showSaveFeedback(`Modelo ${model} ativado`);
			}

			// 🔥 NOVO: Atualiza UI
			this.updateModelStatusUI();
			this.saveConfig();

			// 🔥 NOVO: Se for OpenAI, inicializa cliente no main
			if (model === 'openai') {
				await _ipc.invoke('initialize-api-client', savedKey);
			}
		} catch (error) {
			console.error(`❌ Erro ao alternar modelo ${model}:`, error);
			this.showError(`Erro ao alternar modelo: ${error.message}`);
		}

		debugLogConfig('Fim da função: "toggleModel"');
	}

	// Atualiza status dos modelos na UI
	updateModelStatusUI() {
		debugLogConfig('Início da função: "updateModelStatusUI"');
		Object.keys(this.config.api).forEach(model => {
			if (model !== 'activeProvider' && this.config.api[model]) {
				const statusBadge = document
					.querySelector(`[data-model="${model}"]`)
					?.closest('.model-status')
					?.querySelector('.status-badge');
				const activateButton = document.querySelector(`[data-model="${model}"]`);

				if (statusBadge && activateButton) {
					if (this.config.api[model].enabled) {
						statusBadge.textContent = 'Ativo';
						statusBadge.className = 'status-badge active';
						activateButton.textContent = 'Desativar';
					} else {
						statusBadge.textContent = 'Inativo';
						statusBadge.className = 'status-badge inactive';
						activateButton.textContent = 'Ativar';
					}
				}
			}
		});

		debugLogConfig('Fim da função: "updateModelStatusUI"');
	}

	// 🔥 MODIFICAR: saveField para enviar chave quando ela for alterada
	saveField(fieldId, value) {
		debugLogConfig('Início da função: "saveField"');
		const path = this.getConfigPath(fieldId);
		if (path) {
			console.log(`💾 saveField("${fieldId}", "${value}")`);
			console.log(`   caminho: ${path.join(' → ')}`);
			this.setNestedValue(this.config, path, value);
			console.log(`   ✅ Valor atualizado em this.config`);

			// 🔥 SE FOR A CHAVE DA API, ENVIA PARA O MAIN
			if (fieldId === 'openai-api-key') {
				setTimeout(() => this.sendApiKeyToMain(), 100);
			}
		} else {
			console.warn(`⚠️ saveField: fieldId "${fieldId}" não encontrado no pathMap`);
		}

		debugLogConfig('Fim da função: "saveField"');
	}

	// 🔥 MODIFICADO: salva API key de forma segura separadamente
	async saveSection(section) {
		debugLogConfig('Início da função: "saveSection"');
		const sectionElement =
			document.getElementById(section) || document.querySelector(`[data-section="${section}"]`)?.closest('.tab-pane');

		if (sectionElement) {
			// 🔥 NOVO: Processa API key primeiro (se houver)
			const apiKeyInput = sectionElement.querySelector('.api-key-input');

			if (apiKeyInput?.id) {
				const provider = section; // 'openai', 'google', etc.
				const apiKey = apiKeyInput.value; // 🔥 Pega valor completo

				// 🔥 DEBUG: Log antes de salvar
				console.log(`saveSection - provider: ${provider}`);
				console.log(`saveSection - input.value length: ${apiKey?.length || 0}`);
				console.log(`saveSection - input.value completo: ${apiKey}`); // 🔥 TEMPORÁRIO

				// 🔥 Só salva se não estiver mascarado E tiver conteúdo
				if (apiKey && !apiKey.includes('••••') && apiKey.trim().length > 0) {
					console.log(`Salvando nova chave para ${provider}...`);
					await this.saveApiKey(provider, apiKey);
				} else if (apiKey.includes('••••')) {
					console.log(`Chave mascarada detectada - mantendo chave existente`);
				} else {
					console.log(`Campo vazio - não salvando`);
				}
			}

			// Salva outros campos normalmente (exceto API key)
			sectionElement.querySelectorAll('input:not(.api-key-input), select, textarea').forEach(input => {
				if (input.id) {
					this.saveField(input.id, input.value);
				}
			});
		}

		this.saveConfig();

		debugLogConfig('Fim da função: "saveSection"');
	}

	// Converte ID do campo para caminho na configuração
	getConfigPath(fieldId) {
		debugLogConfig('Início da função: "getConfigPath"');
		const pathMap = {
			// 🔥 API: Modelos STT e LLM (combo-boxes)
			'openai-stt-model': ['api', 'openai', 'selectedSTTModel'],
			'openai-llm-model': ['api', 'openai', 'selectedLLMModel'],

			'google-stt-model': ['api', 'google', 'selectedSTTModel'],
			'google-llm-model': ['api', 'google', 'selectedLLMModel'],

			'openrouter-stt-model': ['api', 'openrouter', 'selectedSTTModel'],
			'openrouter-llm-model': ['api', 'openrouter', 'selectedLLMModel'],

			// 🔥 DEPRECATED: Manter para compatibilidade reversa (será removido)
			'openai-transcription-model': ['api', 'openai', 'selectedSTTModel'],
			'openai-response-model': ['api', 'openai', 'selectedLLMModel'],
			'google-transcription-model': ['api', 'google', 'selectedSTTModel'],
			'google-response-model': ['api', 'google', 'selectedLLMModel'],
			'openrouter-transcription-model': ['api', 'openrouter', 'selectedSTTModel'],
			'openrouter-response-model': ['api', 'openrouter', 'selectedLLMModel'],

			// 'custom-endpoint': ['api', 'custom', 'endpoint'],
			// 'custom-transcription-model': ['api', 'custom', 'selectedSTTModel'],
			// 'custom-response-model': ['api', 'custom', 'selectedLLMModel'],

			// Áudio
			'audio-input-device': ['audio', 'inputDevice'],
			'audio-output-device': ['audio', 'outputDevice'],
			'auto-detect-devices': ['audio', 'autoDetect'],

			// Tela
			'screenshot-hotkey': ['screen', 'screenshotHotkey'],
			'exclude-app-from-screenshot': ['screen', 'excludeAppFromScreenshot'],
			'screenshot-format': ['screen', 'imageFormat'],

			// Privacidade
			'hide-from-screen-capture': ['privacy', 'hideFromScreenCapture'],
			'disable-telemetry': ['privacy', 'disableTelemetry'],
			'auto-clear-data': ['privacy', 'autoClearData'],
			'data-retention-days': ['privacy', 'dataRetentionDays'],

			// Outros
			language: ['other', 'language'],
			theme: ['other', 'theme'],
			'auto-update': ['other', 'autoUpdate'],
			'log-level': ['other', 'logLevel'],
			darkModeToggle: ['other', 'darkMode'],
			interviewModeSelect: ['other', 'interviewMode'],
			opacityRange: ['other', 'overlayOpacity'],
		};

		debugLogConfig('Fim da função: "getConfigPath"');
		return pathMap[fieldId];
	}

	// Define valor aninhado em objeto
	setNestedValue(obj, path, value) {
		const lastKey = path.pop();
		const lastObj = path.reduce((o, key) => (o[key] = o[key] || {}), obj);

		// Converte para booleano se necessário
		if (typeof lastObj[lastKey] === 'boolean') {
			lastObj[lastKey] = value === 'true' || value === true;
		} else {
			lastObj[lastKey] = value;
		}
	}

	// Alterna visibilidade de senha
	togglePasswordVisibility(inputId) {
		debugLogConfig('Início da função: "togglePasswordVisibility"');
		const input = document.getElementById(inputId);
		const button = document.querySelector(`[data-target="${inputId}"]`);

		if (input && button) {
			if (input.type === 'password') {
				input.type = 'text';
				button.innerHTML = '<span class="material-icons">visibility_off</span>';
			} else {
				input.type = 'password';
				button.innerHTML = '<span class="material-icons">visibility</span>';
			}
		}

		debugLogConfig('Fim da função: "togglePasswordVisibility"');
	}

	// Envia API key atual do input para o main (quando saveField detecta mudança)
	sendApiKeyToMain() {
		debugLogConfig('Início da função: "sendApiKeyToMain"');
		try {
			const apiKeyInput = document.getElementById('openai-api-key');
			if (!apiKeyInput) return;
			const val = apiKeyInput.value || '';
			// Se o campo estiver mascarado e não houver mudança, ignora
			if (val.includes('••••')) return;
			// Usa o método seguro para salvar
			this.saveApiKey('openai', val);
		} catch (err) {
			console.error('Erro em sendApiKeyToMain:', err);
		}

		debugLogConfig('Fim da função: "sendApiKeyToMain"');
	}

	// Grava atalho do teclado
	recordHotkey(button) {
		debugLogConfig('Início da função: "recordHotkey"');
		button.classList.add('recording');
		button.textContent = 'Pressione uma tecla...';

		const handleKeyDown = e => {
			e.preventDefault();
			e.stopPropagation();

			const keys = [];
			if (e.ctrlKey) keys.push('Ctrl');
			if (e.shiftKey) keys.push('Shift');
			if (e.altKey) keys.push('Alt');
			if (e.metaKey) keys.push('Cmd');

			// Adiciona a tecla principal (excluindo modificadoras)
			if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
				keys.push(e.key.toUpperCase());
			}

			const hotkey = keys.join('+');
			document.getElementById('screenshot-hotkey').value = hotkey;

			// Salva automaticamente
			this.saveField('screenshot-hotkey', hotkey);
			this.saveConfig();

			// Remove listeners
			button.classList.remove('recording');
			button.textContent = 'Gravar Atalho';
			globalThis.removeEventListener('keydown', handleKeyDown);
		};

		globalThis.addEventListener('keydown', handleKeyDown);

		debugLogConfig('Fim da função: "recordHotkey"');
	}

	// Exporta configurações
	exportConfig() {
		debugLogConfig('Início da função: "exportConfig"');
		const dataStr = JSON.stringify(this.config, null, 2);
		const dataBlob = new Blob([dataStr], { type: 'application/json' });

		const downloadLink = document.createElement('a');
		downloadLink.href = URL.createObjectURL(dataBlob);
		downloadLink.download = 'Askme-config.json';
		downloadLink.click();

		debugLogConfig('Fim da função: "exportConfig"');
	}

	// Importa configurações
	importConfig() {
		debugLogConfig('Início da função: "importConfig"');
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = e => {
			const file = e.target.files[0];
			if (!file) return;

			file
				.text()
				.then(text => {
					try {
						const importedConfig = JSON.parse(text);
						this.config = { ...this.config, ...importedConfig };
						this.saveConfig();
						this.showSaveFeedback();

						// Recarrega a página para aplicar as configurações
						setTimeout(() => location.reload(), 1500);
					} catch (error) {
						console.error('Erro ao fazer parse do arquivo de configurações:', error);
						this.showError('Erro ao importar configurações: arquivo inválido');
					}
				})
				.catch(error => {
					console.error('Erro ao ler arquivo:', error);
					this.showError('Erro ao ler arquivo de configurações');
				});
		};

		input.click();

		debugLogConfig('Fim da função: "importConfig"');
	}

	// Restaura configurações padrão
	resetConfig() {
		debugLogConfig('Início da função: "resetConfig"');
		if (confirm('Tem certeza que deseja restaurar todas as configurações para os valores padrão?')) {
			this.config = this.getDefaultConfig();
			localStorage.removeItem('appConfig');
			location.reload();
		}

		debugLogConfig('Fim da função: "resetConfig"');
	}

	// Retorna configurações padrão
	getDefaultConfig() {
		debugLogConfig('Início da função: "getDefaultConfig"');
		debugLogConfig('Fim da função: "getDefaultConfig"');
		return {
			api: {
				activeProvider: 'openai',
				openai: {
					// 🔥 MODIFICADO: API key não é mais salva aqui
					transcriptionModel: 'whisper-1',
					responseModel: 'gpt-4o-mini',
					enabled: true,
				},
				google: {
					transcriptionModel: '',
					responseModel: 'gemini-pro',
					enabled: false,
				},
				openrouter: {
					transcriptionModel: '',
					responseModel: '',
					enabled: false,
				},
				// custom: {
				// 	endpoint: '',
				// 	transcriptionModel: '',
				// 	responseModel: '',
				// 	enabled: false,
				// },
			},
			audio: {
				inputDevice: '',
				outputDevice: '',
				autoDetect: true,
			},
			screen: {
				screenshotHotkey: 'Ctrl+Shift+S',
				excludeAppFromScreenshot: true,
				imageFormat: 'png',
			},
			privacy: {
				hideFromScreenCapture: false,
				disableTelemetry: false,
				autoClearData: false,
				dataRetentionDays: 7,
			},
			other: {
				language: 'pt-BR',
				theme: 'auto',
				autoUpdate: true,
				logLevel: 'info',
			},
		};
	}

	// Retorna configuração específica
	get(keyPath) {
		return keyPath.split('.').reduce((o, k) => o?.[k], this.config);
	}

	// Define configuração específica
	set(keyPath, value) {
		const keys = keyPath.split('.');
		const lastKey = keys.pop();
		const lastObj = keys.reduce((o, k) => (o[k] = o[k] || {}), this.config);
		lastObj[lastKey] = value;
		this.save();

		// Log de debug para confirmar salvamento de chaves
		if (keyPath.includes('apiKey')) {
			console.log(`🔐 Config ${keyPath} atualizada localmente.`);
		}
	}

	/* ===============================
	   🔥 CONTROLLER INITIALIZATION
	   All UI interactions and renderer service calls
	=============================== */

	async initializeController() {
		debugLogConfig('Início da função: "initializeController"');
		try {
			// ✅ 1. Registrar UIElements ANTES de iniciar monitoramento
			this.registerUIElements();

			// ✅ 2. Registrar callbacks do renderer
			this.registerRendererCallbacks();

			// ✅ 3. Inicializar APP_CONFIG no renderer
			globalThis.RendererAPI.setAppConfig({ MODE_DEBUG: false }); // true para iniciar com debug

			// ✅ 4. Restaurar tema
			this.restoreTheme();

			// ✅ 5. Restaurar opacidade
			// 🔥 MOVED: agora feito em initEventListeners()

			// ✅ 6. Restaurar modo (NORMAL | INTERVIEW)
			this.restoreMode();

			// ✅ 7. Solicitar permissão de áudio
			await navigator.mediaDevices.getUserMedia({ audio: true });

			// ✅ 8. Carregar dispositivos de áudio
			await this.loadDevices();

			// ✅ 9. Restaura dispositivos de áudios salvos
			this.restoreDevices();

			// ✅ 10. Restaura modelos STT e LLM salvos
			this.restoreSTTLLMModels();

			// ✅ 11. Restaura preferências do usuário (darkMode, interviewMode, opacity)
			this.restoreUserPreferences();

			// ✅ 12. Sincronizar API key
			await this.syncApiKeyOnStart();

			// ✅ 13. Inicializar Click-through
			await this.initClickThroughController();

			// ✅ 14. Registrar listeners de eventos DOM
			this.registerDOMEventListeners();

			// ✅ 15. Registrar listeners de IPC
			this.registerIPCListeners();

			// ✅ 16. Registrar listeners de erro global
			this.registerErrorHandlers();

			console.log('✅ Controller inicializado com sucesso');
		} catch (error) {
			console.error('❌ Erro ao inicializar controller:', error);
		}

		debugLogConfig('Fim da função: "initializeController"');
	}

	// 🔥 NOVO: Registrar UIElements para que renderer.js possa ler valores
	registerUIElements() {
		debugLogConfig('Início da função: "registerUIElements"');
		const elements = {
			inputSelect: document.getElementById('audio-input-device'),
			outputSelect: document.getElementById('audio-output-device'),
			listenBtn: document.getElementById('listenBtn'),
			statusText: document.getElementById('status'),
			transcriptionBox: document.getElementById('conversation'),
			currentQuestionBox: document.getElementById('currentQuestion'),
			currentQuestionTextBox: document.getElementById('currentQuestionText'),
			questionsHistoryBox: document.getElementById('questionsHistory'),
			answersHistoryBox: document.getElementById('answersHistory'),
			askBtn: document.getElementById('askGptBtn'),
			inputVu: document.getElementById('inputVu'),
			outputVu: document.getElementById('outputVu'),
			inputVuHome: document.getElementById('inputVuHome'),
			outputVuHome: document.getElementById('outputVuHome'),
			mockToggle: document.getElementById('mockToggle'),
			mockBadge: document.getElementById('mockBadge'),
			interviewModeSelect: document.getElementById('interviewModeSelect'),
			btnClose: document.getElementById('btnClose'),
			btnToggleClick: document.getElementById('btnToggleClick'),
			dragHandle: document.getElementById('dragHandle'),
			darkToggle: document.getElementById('darkModeToggle'),
			opacityRange: document.getElementById('opacityRange'),
		};

		globalThis.RendererAPI.registerUIElements(elements);

		debugLogConfig('Fim da função: "registerUIElements"');
	}

	// 🔥 NOVO: Registrar callbacks do renderer para atualizar DOM
	registerRendererCallbacks() {
		debugLogConfig('Início da função: "registerRendererCallbacks"');
		console.log('🔥 registerRendererCallbacks: Iniciando registro de callbacks UI...');

		// VERIFICAÇÃO CRÍTICA: RendererAPI DEVE estar disponível
		if (!globalThis.RendererAPI || typeof globalThis.RendererAPI.onUIChange !== 'function') {
			console.error('❌ ERRO CRÍTICO: globalThis.RendererAPI.onUIChange não disponível!');
			return;
		}

		// 🔥 NOVO: Exibir erros (validação de modelo, dispositivo, etc)
		globalThis.RendererAPI.onUIChange('onError', message => {
			console.error(`❌ Erro renderizado: ${message}`);
			this.showError(message);
		});

		// Transcrição
		globalThis.RendererAPI.onUIChange('onTranscriptAdd', data => {
			const { author, text, timeStr, elementId, placeholderId } = data;
			const transcriptionBox = document.getElementById(elementId || 'conversation');
			if (!transcriptionBox) {
				console.warn(`⚠️ Elemento de transcrição não encontrado: ${elementId || 'conversation'}`);
				return;
			}

			const div = document.createElement('div');
			div.className = 'transcript-item';

			// Se for placeholder (texto = "..."), marca para ser atualizado depois
			if (text === '...') {
				// Evita duplicar placeholder caso já exista um criado por onPlaceholderUpdate (race)
				if (placeholderId) {
					const existing = document.getElementById(placeholderId);
					if (existing) {
						debugLogConfig('⚪ Placeholder já existe, ignorando criação duplicada:', placeholderId, false);
						return;
					}
				}
				div.dataset.isPlaceholder = 'true';
				// 🔥 ATRIBUIR ID AO ELEMENTO REAL DO DOM
				if (placeholderId) {
					div.id = placeholderId;
					debugLogConfig('🔥 ID atribuído ao placeholder real:', placeholderId, false);
				}
				// 🔥 Não adicionar "..." visível - deixar para atualizar depois com texto real
				div.innerHTML = ''; // Elemento vazio, será preenchido com onPlaceholderFulfill
				debugLogConfig('✅ Placeholder reservado no DOM (vazio, aguardando transcrição):', placeholderId, false);
			} else {
				div.innerHTML = `<span style="color:#888">[${timeStr}]</span> <strong>${author}:</strong> ${text}`;
				debugLogConfig(`✅ Transcrição adicionada: ${author} - ${text}`, false);
			}

			transcriptionBox.appendChild(div);

			// 📜 Auto-scroll para acompanhar a fala em tempo real
			// Faz scroll no container pai que tem overflow-y: auto
			requestAnimationFrame(() => {
				const container = transcriptionBox.parentElement;
				if (container?.id === 'transcriptionContainer') {
					container.scrollTop = container.scrollHeight;

					debugLogConfig(
						'📜 Auto-scroll para última transcrição',
						{ scrollTop: container.scrollTop, scrollHeight: container.scrollHeight },
						false,
					);
				}
			});
		});

		// Status
		globalThis.RendererAPI.onUIChange('onStatusUpdate', data => {
			const { message } = data;
			const statusText = document.getElementById('status');
			if (statusText) statusText.innerText = message;
		});

		// Input Volume
		globalThis.RendererAPI.onUIChange('onInputVolumeUpdate', data => {
			const { percent } = data;
			const inputVu = document.getElementById('inputVu');
			if (inputVu) inputVu.style.width = percent + '%';

			const inputVuHome = document.getElementById('inputVuHome');
			if (inputVuHome) inputVuHome.style.width = percent + '%';
		});

		// Output Volume
		globalThis.RendererAPI.onUIChange('onOutputVolumeUpdate', data => {
			const { percent } = data;
			const outputVu = document.getElementById('outputVu');
			if (outputVu) outputVu.style.width = percent + '%';

			const outputVuHome = document.getElementById('outputVuHome');
			if (outputVuHome) outputVuHome.style.width = percent + '%';
		});

		// Mock Badge
		globalThis.RendererAPI.onUIChange('onMockBadgeUpdate', data => {
			const { visible } = data;
			const mockBadge = document.getElementById('mockBadge');
			if (mockBadge) {
				visible ? mockBadge.classList.remove('hidden') : mockBadge.classList.add('hidden');
			}
		});

		// Listen Button Toggle (altera o texto do botão "Começar a Ouvir... (Ctrl+d)")
		globalThis.RendererAPI.onUIChange('onListenButtonToggle', data => {
			const { isRunning, buttonText } = data;
			const listenBtn = document.getElementById('listenBtn');
			if (listenBtn) {
				listenBtn.innerText = buttonText;
				// 🔥 Mudar cor: vermelha quando ouvindo, cor original quando parado
				if (isRunning) {
					listenBtn.classList.add('listening');
				} else {
					listenBtn.classList.remove('listening');
				}
				console.log(`🎙️ Botão atualizado: ${buttonText} | Ouvindo: ${isRunning ? 'SIM' : 'NÃO'}`);
			}

			// 🔥 NOVO: Aplica efeito visual no home
			const homeVuMeters = document.querySelector('.home-vu-meters');
			if (homeVuMeters) {
				homeVuMeters.classList.toggle('listening', isRunning);
			}
		});

		// Clear All Selections
		globalThis.RendererAPI.onUIChange('onClearAllSelections', () => {
			const currentQuestionBox = document.getElementById('currentQuestion');
			if (currentQuestionBox) currentQuestionBox.classList.remove('selected-question');

			const questionsHistoryBox = document.getElementById('questionsHistory');
			if (questionsHistoryBox) {
				questionsHistoryBox.querySelectorAll('.selected-question').forEach(el => {
					el.classList.remove('selected-question');
				});
			}
		});

		// Scroll to Question
		globalThis.RendererAPI.onUIChange('onScrollToQuestion', data => {
			const { questionId } = data;
			const questionsHistoryBox = document.getElementById('questionsHistory');
			if (!questionsHistoryBox) return;

			const el = questionsHistoryBox.querySelector(`.question-block[data-qid="${questionId}"]`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		});

		// Pergunta Atual - Elemento: currentQuestion
		globalThis.RendererAPI.onUIChange('onCurrentQuestionUpdate', data => {
			// NOSONAR console.log(`📥 config-manager: onCurrentQuestionUpdate recebido:`, data);

			const { text, isSelected } = data;

			const currentQuestionBox = document.getElementById('currentQuestion');
			if (!currentQuestionBox) {
				console.warn(`⚠️ config-manager: elemento #currentQuestion não encontrado`);
				return;
			}

			// Procura por span dentro do elemento (pode ser currentQuestionText)
			const textEl = currentQuestionBox.querySelector('span') || currentQuestionBox;
			if (textEl) {
				debugLogConfig(
					`✅ config-manager: atualizando texto em elemento:`,
					{
						seletor: textEl.id || textEl.className,
						texto: text,
					},
					false,
				);
				textEl.innerText = text;
			} else {
				console.warn(`⚠️ config-manager: elemento de texto não encontrado dentro de #currentQuestion`);
			}

			if (isSelected) {
				currentQuestionBox.classList.add('selected-question');
			} else {
				currentQuestionBox.classList.remove('selected-question');
			}
		});

		// Histórico de Perguntas
		globalThis.RendererAPI.onUIChange('onQuestionsHistoryUpdate', data => {
			const questionsHistoryBox = document.getElementById('questionsHistory');
			if (!questionsHistoryBox) return;

			questionsHistoryBox.innerHTML = '';
			data.forEach(q => {
				const div = document.createElement('div');
				div.className = 'question-block';
				div.dataset.qid = q.id;
				if (q.isSelected) div.classList.add('selected-question');
				if (q.isAnswered) div.classList.add('answered');
				if (q.isIncomplete) div.classList.add('incomplete');

				// 🔥 Adicionar badge de turnId se disponível
				const turnIdBadge = q.turnId ? `<span class="turn-id-badge">${q.turnId}</span>` : '';
				div.innerHTML = `${turnIdBadge}<span>${q.text}</span>`;

				questionsHistoryBox.appendChild(div);
			});
		});

		// Answer Selected — exibe resposta existente e faz scroll
		globalThis.RendererAPI.onUIChange('onAnswerSelected', payload => {
			debugLogConfig('📌 onAnswerSelected recebido:', payload, false);

			if (!payload) return;

			const { questionId, shouldScroll } = payload;
			if (!questionId) return;

			const answersBox = document.getElementById('answersHistory');
			if (!answersBox) return;

			debugLogConfig('🎨 [onAnswerSelected] Removendo destaque anterior', false);
			// remove seleção anterior
			answersBox.querySelectorAll('.selected-answer').forEach(el => {
				debugLogConfig('🎨 [onAnswerSelected] Removendo destaque de:', el.dataset.questionId, false);
				el.classList.remove('selected-answer');
			});

			// procura resposta vinculada à pergunta
			const answerEl = answersBox.querySelector(`[data-question-id="${questionId}"]`);

			if (!answerEl) {
				console.warn('⚠️ Resposta não encontrada para questionId:', questionId);
				return;
			}

			// marca como selecionada
			debugLogConfig('🎨 [onAnswerSelected] Adicionando destaque em:', questionId, false);
			answerEl.classList.add('selected-answer');

			// garante visibilidade com scroll suave
			if (shouldScroll) {
				debugLogConfig('📜 [onAnswerSelected] Scrollando para resposta:', questionId, false);
				answerEl.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				});
			}
		});

		// 🔥 COMENTADO: onAnswerAdd - Renderização formatada desabilitada
		// Apenas streaming (tokens em tempo real) será exibido

		// ═══════════════════════════════════════════════════════════════════════════════════
		// 📊 RASTREAMENTO SIMPLES - currentStreamingQuestionId é SUFICIENTE
		// ═══════════════════════════════════════════════════════════════════════════════════
		let currentStreamingQuestionId = null; // Qual pergunta está sendo respondida AGORA
		let currentStreamingTurnId = null; // TurnId da pergunta sendo respondida

		// ═══════════════════════════════════════════════════════════════════════════════════
		// 📥 LISTENER: onAnswerStreamChunk
		// Chamado para CADA token que chega do GPT
		// ═══════════════════════════════════════════════════════════════════════════════════
		globalThis.RendererAPI.onUIChange('onAnswerStreamChunk', data => {
			const { questionId, turnId, accum } = data;
			const answersHistoryBox = document.getElementById('answersHistory');
			if (!answersHistoryBox) return;

			// 🔍 PROCURAR wrapper existente OU criar novo
			let wrapper = answersHistoryBox.querySelector(`.answer-block[data-question-id="${questionId}"]`);

			// ✅ PRIMEIRA CHUNK - não existe wrapper ainda
			if (!wrapper) {
				debugLogConfig('⚡ [CHUNK-PRIMEIRA] Criando novo bloco para:', questionId, false);

				// Criar novo div de resposta
				wrapper = document.createElement('div');
				wrapper.className = 'answer-block';
				wrapper.dataset.questionId = questionId;

				// 🔥 Adicionar badge de turnId se disponível
				const turnIdBadge = turnId ? `<span class="turn-id-badge answer">${turnId}</span>` : '';
				wrapper.innerHTML = `${turnIdBadge}<div class="answer-content"></div>`;

				// Inserir NO TOPO
				answersHistoryBox.insertBefore(wrapper, answersHistoryBox.firstChild);

				// 🎨 Destaque: remover de outros, adicionar neste
				answersHistoryBox.querySelectorAll('.answer-block.selected-answer').forEach(el => {
					el.classList.remove('selected-answer');
				});
				wrapper.classList.add('selected-answer');

				// Auto-scroll para topo
				answersHistoryBox.parentElement?.scrollTo?.({ top: 0, behavior: 'smooth' });

				// Registrar qual pergunta está sendo respondida
				currentStreamingQuestionId = questionId;
				currentStreamingTurnId = turnId;

				debugLogConfig('📊 Total blocos agora: ', answersHistoryBox.querySelectorAll('.answer-block').length, false);
			}

			// ✅ CHUNKS SUBSEQUENTES - atualizar conteúdo com markdown renderizado
			const answerContent = wrapper.querySelector('.answer-content');
			if (answerContent) {
				// 🔥 Renderizar como markdown em tempo real (estilo GPT)
				const htmlContent = marked.parse(accum);
				answerContent.innerHTML = htmlContent;
				answersHistoryBox.parentElement?.scrollTo?.({ top: 0, behavior: 'auto' });
			}
		});

		// ═══════════════════════════════════════════════════════════════════════════════════
		// 🔄 LISTENER: onAnswerIdUpdate
		// Chamado quando CURRENT → 1, 2, 3, etc
		// ═══════════════════════════════════════════════════════════════════════════════════
		globalThis.RendererAPI.onUIChange('onAnswerIdUpdate', data => {
			const { oldId, newId } = data;
			const answersHistoryBox = document.getElementById('answersHistory');
			if (!answersHistoryBox) return;

			debugLogConfig('🔄 [ID_UPDATE] ' + oldId + ' → ' + newId, false);

			const wrapper = answersHistoryBox.querySelector(`.answer-block[data-question-id="${oldId}"]`);
			if (wrapper) {
				wrapper.dataset.questionId = newId;
				debugLogConfig('✅ [ID_UPDATE] Atualizado: ' + oldId + ' → ' + newId, false);

				// Atualizar rastreamento de streaming também
				if (currentStreamingQuestionId === oldId) {
					currentStreamingQuestionId = newId;
				}
			} else {
				console.warn('⚠️ [ID_UPDATE] Wrapper não encontrado:', oldId);
			}
		});

		// ═══════════════════════════════════════════════════════════════════════════════════
		// ⏹️ LISTENER: onAnswerStreamEnd
		// Chamado quando stream termina
		// ═══════════════════════════════════════════════════════════════════════════════════
		globalThis.RendererAPI.onUIChange('onAnswerStreamEnd', data => {
			debugLogConfig('✅ [STREAM_END] Limpando streamingQuestionId', false);
			currentStreamingQuestionId = null;
		});

		// Placeholder Fulfill (para atualizar placeholders de áudio)
		globalThis.RendererAPI.onUIChange('onPlaceholderFulfill', data => {
			debugLogConfig('🔔 onPlaceholderFulfill recebido:', data, false);

			// 🔥 EXTRAIR O ID DO PLACEHOLDER (novo campo)
			const { speaker, text, stopStr, startStr, recordingDuration, latency, total, showMeta } = data;
			const transcriptionBox = document.getElementById('conversation');

			if (!transcriptionBox) {
				console.error('❌ transcriptionBox não encontrado');
				return;
			}

			// 🔥 USAR ID DO PLACEHOLDER AO INVÉS DE SELECIONAR O ÚLTIMO
			let targetPlaceholder = this.findTargetPlaceholder(data, transcriptionBox);

			if (!targetPlaceholder) {
				console.warn('⚠️ Nenhum placeholder encontrado para atualizar');
				return;
			}

			// Atualiza conteúdo do placeholder
			targetPlaceholder.innerHTML = `<span style="color:#888">[${stopStr}]</span> <strong>${speaker}:</strong> ${text}`;
			delete targetPlaceholder.dataset.isPlaceholder;

			debugLogConfig('✅ Placeholder atualizado:', text.substring(0, 50) + '...', false);

			// Só cria/atualiza metadados se houver texto visível no placeholder e showMeta não for false
			const hasVisibleText = text && String(text).trim().length > 0;
			if (hasVisibleText && showMeta !== false) {
				// Insere metadados DENTRO do placeholder para evitar órfãos caso o elemento pai seja removido
				let meta = targetPlaceholder.querySelector('.transcript-meta');
				if (!meta) {
					meta = document.createElement('div');
					meta.className = 'transcript-meta';
					meta.style.fontSize = '0.8em';
					meta.style.color = '#888';
					meta.style.marginTop = '2px';
					meta.style.marginBottom = '2px';
					targetPlaceholder.appendChild(meta);
				}
				meta.innerText = `[${startStr} - ${stopStr}] (grav ${recordingDuration}ms, lat ${latency}ms, total ${total}ms)`;
				console.log('✅ Metadados adicionados/atualizados');
			} else {
				// Remove metadados existentes se o placeholder não tem texto
				const existingMeta = targetPlaceholder.querySelector('.transcript-meta');
				if (existingMeta) existingMeta.remove();
			}
		});

		// Placeholder Update (atualização incremental enquanto o áudio ainda está em andamento)
		globalThis.RendererAPI.onUIChange('onPlaceholderUpdate', data => {
			const { speaker, text, timeStr, startStr, stopStr, recordingDuration, latency, total, placeholderId } = data;

			const transcriptionBox = document.getElementById('conversation');
			if (!transcriptionBox) return;

			const placeholders = transcriptionBox.querySelectorAll('[data-is-placeholder="true"]');
			// fallback: cria um novo placeholder se não existir
			if (!placeholders || placeholders.length === 0) {
				const div = document.createElement('div');
				div.className = 'transcript-item';
				div.dataset.isPlaceholder = 'true';
				const ts = timeStr || new Date().toLocaleTimeString();
				div.innerHTML = `<span style="color:#888">[${ts}]</span> <strong>${speaker}:</strong> ${text}`;
				// Se um placeholderId foi fornecido, atribui para evitar criação duplicada por race
				if (placeholderId) {
					div.id = placeholderId;
					console.log('📍 Criando placeholder com ID (fallback):', placeholderId);
				}
				transcriptionBox.appendChild(div);

				// cria meta provisório DENTRO do placeholder SOMENTE se houver texto visível
				const hasVisibleText = text && String(text).trim().length > 0;
				if (hasVisibleText && (startStr || stopStr || recordingDuration)) {
					const meta = document.createElement('div');
					meta.className = 'transcript-meta';
					meta.innerText = `[${startStr || ts} - ${stopStr || ts}] (grav ${recordingDuration || 0}ms, lat ${
						latency || 0
					}ms, total ${total || 0}ms)`;
					div.appendChild(meta);
				}

				return;
			}

			// se placeholderId foi fornecido, preferir o elemento com esse id
			let lastPlaceholder = null;
			if (placeholderId) {
				lastPlaceholder = document.getElementById(placeholderId);
				if (lastPlaceholder) console.log('📍 Atualizando placeholder por ID:', placeholderId);
			}
			if (!lastPlaceholder) lastPlaceholder = placeholders[placeholders.length - 1];

			const ts = timeStr || new Date().toLocaleTimeString();
			lastPlaceholder.innerHTML = `<span style="color:#888">[${ts}]</span> <strong>${speaker}:</strong> ${text}`;

			// Atualiza ou cria o elemento de meta DENTRO do placeholder
			let meta = lastPlaceholder.querySelector('.transcript-meta');
			const hasVisibleText = text && String(text).trim().length > 0;
			if (!meta && hasVisibleText && (startStr || stopStr || recordingDuration)) {
				meta = document.createElement('div');
				meta.className = 'transcript-meta';
				meta.style.fontSize = '0.8em';
				meta.style.color = '#888';
				meta.style.marginTop = '2px';
				meta.style.marginBottom = '2px';
				lastPlaceholder.appendChild(meta);
			}

			// exibe métricas provisórias (se disponíveis e houver texto)
			if (meta && hasVisibleText && (startStr || stopStr || recordingDuration)) {
				meta.innerText = `[${startStr || ts} - ${stopStr || ts}] (grav ${recordingDuration || 0}ms, lat ${
					latency || 0
				}ms, total ${total || 0}ms)`;
			} else if (meta && !hasVisibleText) {
				// limpa/remova metadados se não há texto visível
				meta.remove();
			}

			// mantém data-is-placeholder até receber onPlaceholderFulfill
		});

		// Update Interim (atualização em tempo real para transcrições interims)
		globalThis.RendererAPI.onUIChange('onUpdateInterim', data => {
			const { id, speaker, text } = data;

			let interimElement = document.getElementById(id);
			if (!interimElement) {
				// Cria o elemento se não existir
				interimElement = document.createElement('div');
				interimElement.id = id;
				interimElement.className = 'transcript-item interim';
				interimElement.style.color = '#888'; // Cor para indicar interim
				const transcriptionBox = document.getElementById('conversation');
				if (transcriptionBox) {
					transcriptionBox.appendChild(interimElement);
				}
			}

			// Atualiza o texto
			const ts = new Date().toLocaleTimeString();
			interimElement.innerHTML = `<span style="color:#888">[${ts}]</span> <strong>${speaker}:</strong> ${text}`;
		});

		// Clear Interim (remove o elemento interim quando finalizado)
		globalThis.RendererAPI.onUIChange('onClearInterim', data => {
			const { id } = data;
			const interimElement = document.getElementById(id);
			if (interimElement) {
				interimElement.remove();
			}
		});

		// Clear Transcription
		globalThis.RendererAPI.onUIChange('onTranscriptionCleared', () => {
			const transcriptionBox = document.getElementById('conversation');
			if (transcriptionBox) transcriptionBox.innerHTML = '';
		});

		// Clear Answers
		globalThis.RendererAPI.onUIChange('onAnswersCleared', () => {
			const answersHistoryBox = document.getElementById('answersHistory');
			if (answersHistoryBox) answersHistoryBox.innerHTML = '';
		});

		// Mode Select Update
		globalThis.RendererAPI.onUIChange('onModeSelectUpdate', data => {
			const { mode } = data;
			const interviewModeSelect = document.getElementById('interviewModeSelect');
			if (interviewModeSelect) interviewModeSelect.value = mode;
		});

		// 📸 NOVO: Screenshot badge
		globalThis.RendererAPI.onUIChange('onScreenshotBadgeUpdate', data => {
			const { count, visible } = data;
			const badge = document.getElementById('screenshotBadge');

			if (!badge) return;

			if (visible && count > 0) {
				badge.textContent = `📸 ${count} screenshot${count > 1 ? 's' : ''}`;
				badge.classList.remove('hidden');
			} else {
				badge.classList.add('hidden');
			}
		});

		console.log('✅ registerRendererCallbacks: Todos os callbacks UI registrados com sucesso');

		debugLogConfig('Fim da função: "registerRendererCallbacks"');
	}

	registerDOMEventListeners() {
		debugLogConfig('Início da função: "registerDOMEventListeners"');

		console.log('🔥 registerDOMEventListeners: Iniciando registro de listeners...');

		// ⚠️ VERIFICAÇÃO CRÍTICA: RendererAPI DEVE estar disponível
		if (!globalThis.RendererAPI) {
			console.error('❌ ERRO CRÍTICO: globalThis.RendererAPI não disponível em registerDOMEventListeners!');
			return;
		}

		// Mock toggle
		const mockToggle = document.getElementById('mockToggle');
		if (mockToggle) {
			mockToggle.addEventListener('change', async () => {
				console.log('📝 Mock toggle mudou');
				if (!globalThis.RendererAPI) return;

				const isEnabled = mockToggle.checked;
				if (globalThis.RendererAPI?.setAppConfig) {
					globalThis.RendererAPI.setAppConfig({
						...globalThis.RendererAPI.getAppConfig(),
						MODE_DEBUG: isEnabled,
					});
				}

				if (isEnabled) {
					globalThis.RendererAPI?.updateMockBadge(true);
					// 🔥 Usa resetAppState() para limpar TUDO antes de iniciar mock
					if (globalThis.RendererAPI?.resetAppState && typeof globalThis.RendererAPI.resetAppState === 'function') {
						console.log('🧹 Disparando resetAppState() - limpeza antes do mock');
						await globalThis.RendererAPI.resetAppState();
					}
					// 🎭 Resetar índice e iniciar autoplay com delay
					globalThis.mockScenarioIndex = 0;
					globalThis.mockAutoPlayActive = false;
					console.log('🎭 Mock mode ATIVADO - autoplay iniciará em 2 segundos...');

					// Chamar runMockAutoPlay() após delay para deixar UI resetar
					setTimeout(() => {
						if (globalThis.runMockAutoPlay && typeof globalThis.runMockAutoPlay === 'function') {
							console.log('🎭 Disparando runMockAutoPlay() do config-manager');
							globalThis.runMockAutoPlay();
						} else {
							console.warn('⚠️ runMockAutoPlay() não está disponível em window');
						}
					}, 2000);
				} else {
					globalThis.RendererAPI?.updateMockBadge(false);
					// 🔥 NOVO: Usar resetAppState() para limpar TUDO completamente
					if (globalThis.RendererAPI?.resetAppState && typeof globalThis.RendererAPI.resetAppState === 'function') {
						console.log('🧹 Disparando resetAppState() - limpeza completa ao desativar mock');
						await globalThis.RendererAPI.resetAppState();
					} else {
						console.warn('⚠️ resetAppState() não está disponível em globalThis.RendererAPI');
					}
				}
			});

			// 🔥 NOVO: Sincronizar toggle com APP_CONFIG inicial (MODE_DEBUG)
			// Faz DEPOIS de registrar o listener para disparar o evento se necessário
			const currentConfig = globalThis.RendererAPI?.getAppConfig?.();
			if (currentConfig?.MODE_DEBUG) {
				mockToggle.checked = true;
				// Dispara o evento change para REALMENTE ativar o modo debug
				mockToggle.dispatchEvent(new Event('change', { bubbles: true }));
				console.log('✅ Mock toggle inicializado como ATIVO e modo debug DISPARADO');
			}
		}

		// Listen button click (Começar a Ouvir... (Ctrl+d))
		const listenBtn = document.getElementById('listenBtn');
		if (listenBtn) {
			listenBtn.addEventListener('click', e => {
				console.log('Botão listenBtn clicado!');

				if (globalThis.RendererAPI?.listenToggleBtn) {
					globalThis.RendererAPI.listenToggleBtn();
				} else {
					console.error('❌ globalThis.RendererAPI.listenToggleBtn não está disponível!');
				}
			});
		}

		// Ask GPT button
		const askBtn = document.getElementById('askGptBtn');
		if (askBtn) {
			askBtn.addEventListener('click', () => {
				console.log('🔊 DEBUG: askGptBtn clicado!');
				if (globalThis.RendererAPI?.askGpt) {
					globalThis.RendererAPI.askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
					// console.error(
					// 	'registerDOMEventListeners: askGpt() 1759; 🔒 COMENTADA até transcrição em tempo real funcionar',
					// );
				}
			});
		}

		// Close button
		const btnClose = document.getElementById('btnClose');
		if (btnClose) {
			btnClose.addEventListener('click', () => {
				console.log('❌ Botão Fechar clicado');
				_ipc.send('APP_CLOSE');
			});
		}

		// Questions click handling
		const questionsHistoryBox = document.getElementById('questionsHistory');
		if (questionsHistoryBox) {
			questionsHistoryBox.addEventListener('click', e => {
				const questionBlock = e.target.closest('.question-block');
				if (questionBlock && globalThis.RendererAPI?.handleQuestionClick) {
					const questionId = questionBlock.dataset.qid || questionBlock.id;
					globalThis.RendererAPI.handleQuestionClick(questionId);
				}
			});
		}

		//////////////////////////////////////
		// No método whisper local
		//////////////////////////////////////
		const whisperToggle = document.getElementById('whisperLocalToggle');
		const whisperStatus = document.getElementById('whisperStatus');

		if (whisperToggle && whisperStatus) {
			// Restaurar estado salvo
			const saved = localStorage.getItem('useLocalWhisper') === 'true';
			whisperToggle.checked = saved;

			if (globalThis.RendererAPI?.setTranscriptionMode) {
				globalThis.RendererAPI.setTranscriptionMode(saved);
			}
			whisperStatus.textContent = saved ? '✅ Whisper Local (Ativo)' : '🌐 OpenAI (Ativo)';

			// Evento de mudança
			whisperToggle.addEventListener('change', e => {
				const useLocal = e.target.checked;
				localStorage.setItem('useLocalWhisper', useLocal);

				if (globalThis.RendererAPI?.setTranscriptionMode) {
					globalThis.RendererAPI.setTranscriptionMode(useLocal);
				}

				whisperStatus.textContent = useLocal ? '✅ Whisper Local (Ativo)' : '🌐 OpenAI (Ativo)';

				console.log(`🎤 Modo alterado: ${useLocal ? 'Whisper Local' : 'OpenAI'}`);
			});
		}

		// 📸 NOVO: Clear screenshots button
		const clearScreenshotsBtn = document.getElementById('clearScreenshotsBtn');
		if (clearScreenshotsBtn) {
			clearScreenshotsBtn.addEventListener('click', () => {
				if (!globalThis.RendererAPI?.clearScreenshots) return;

				const count = globalThis.RendererAPI.getScreenshotCount();
				if (count === 0) {
					console.log('ℹ️ Nenhum screenshot para limpar');
					return;
				}

				const confirmed = confirm(`Deseja limpar ${count} screenshot(s)?`);
				if (confirmed) {
					globalThis.RendererAPI.clearScreenshots();
					console.log('✅ Screenshots limpos pelo usuário');
				}
			});
		}

		// 🔥 NOVO: Inicializar drag handle
		const dragHandle = document.getElementById('dragHandle');
		if (dragHandle) {
			this.initDragHandle(dragHandle);
			console.log('✅ Drag handle inicializado');
		} else {
			console.warn('⚠️ dragHandle não encontrado no DOM');
		}

		console.log('✅ registerDOMEventListeners: Todos os listeners registrados com sucesso');

		debugLogConfig('Fim da função: "registerDOMEventListeners"');
	}

	registerIPCListeners() {
		debugLogConfig('Início da função: "registerIPCListeners"');

		console.log('🔥 registerIPCListeners: Iniciando registro de IPC listeners...');

		// ⚠️ VERIFICAÇÃO CRÍTICA: RendererAPI DEVE estar disponível
		if (!globalThis.RendererAPI) {
			console.error('❌ ERRO CRÍTICO: globalThis.RendererAPI não disponível em registerIPCListeners!');
			return;
		}

		// API Key updated
		if (globalThis.RendererAPI?.onApiKeyUpdated) {
			globalThis.RendererAPI.onApiKeyUpdated((_, success) => {
				const statusText = document.getElementById('status');
				if (success) {
					console.log('✅ API key atualizada com sucesso');
					if (statusText) statusText.innerText = '✅ API key configurada com sucesso';

					// não sei se precisa disso
					setTimeout(() => {
						if (statusText?.innerText.includes('API key configurada')) {
							const listenBtn = document.getElementById('listenBtn');
							const isRunning = listenBtn?.innerText === 'Stop';
							statusText.innerText = isRunning ? 'Status: ouvindo...' : 'Status: parado';
						}
					}, 3000);
				}
			});
		}

		// Toggle audio (global shortcut)
		if (globalThis.RendererAPI?.onToggleAudio) {
			globalThis.RendererAPI.onToggleAudio(() => {
				// Começar a ouvir / Parar de ouvir (Ctrl+D)
				if (globalThis.RendererAPI?.listenToggleBtn) {
					globalThis.RendererAPI.listenToggleBtn();
				}
			});
		}

		// Ask GPT (global shortcut)
		if (globalThis.RendererAPI?.onAskGpt) {
			globalThis.RendererAPI.onAskGpt(() => {
				if (globalThis.RendererAPI?.askGpt) {
					globalThis.RendererAPI.askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
					// console.error(
					// 	'registerDOMEventListeners: askGpt() 1867; 🔒 COMENTADA até transcrição em tempo real funcionar',
					// );
				}
			});
		}

		// GPT Stream chunks
		if (globalThis.RendererAPI?.onGptStreamChunk) {
			globalThis.RendererAPI.onGptStreamChunk((_, token) => {
				// Handled in renderer service
			});
		}

		// GPT Stream end
		if (globalThis.RendererAPI?.onGptStreamEnd) {
			globalThis.RendererAPI.onGptStreamEnd(() => {
				// Handled in renderer service
			});
		}

		// 📸 NOVO: Screenshot shortcuts
		if (globalThis.RendererAPI?.onCaptureScreenshot) {
			globalThis.RendererAPI.onCaptureScreenshot(() => {
				console.log('📸 Atalho Ctrl+Shift+F detectado');
				if (globalThis.RendererAPI?.captureScreenshot) {
					globalThis.RendererAPI.captureScreenshot();
				}
			});
		}

		//📸 NOVO: Analyze screenshots shortcut
		if (globalThis.RendererAPI?.onAnalyzeScreenshots) {
			globalThis.RendererAPI.onAnalyzeScreenshots(() => {
				console.log('🔍 Atalho Ctrl+Shift+G detectado');
				if (globalThis.RendererAPI?.analyzeScreenshots) {
					globalThis.RendererAPI.analyzeScreenshots();
				}
			});
		}

		// Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut)
		if (globalThis.RendererAPI?.onNavigateQuestions) {
			globalThis.RendererAPI.onNavigateQuestions(direction => {
				console.log(`⬆️⬇️ Navegacao de perguntas: ${direction}`);
				// Chama a função de navegação diretamente (sem disparar KeyboardEvent que não funciona com focusable: false)
				if (globalThis.RendererAPI?.navigateQuestions) {
					globalThis.RendererAPI.navigateQuestions(direction);
				}
			});
		}

		console.log('✅ registerIPCListeners: Todos os IPC listeners registrados com sucesso');

		debugLogConfig('Fim da função: "registerIPCListeners"');
	}

	registerErrorHandlers() {
		debugLogConfig('Início da função: "registerErrorHandlers"');
		globalThis.addEventListener('error', e => {
			globalThis.RendererAPI.sendRendererError({
				message: e.message ? e.message : String(e),
				stack: e.error?.stack || null,
			});
		});

		globalThis.addEventListener('unhandledrejection', e => {
			globalThis.RendererAPI.sendRendererError({
				message: String(e.reason),
				stack: e.reason?.stack || null,
			});
		});

		debugLogConfig('Fim da função: "registerErrorHandlers"');
	}

	restoreTheme() {
		debugLogConfig('Início da função: "restoreTheme"');
		try {
			const darkToggle = document.getElementById('darkModeToggle');
			// 🔥 CORRIGIDO: Usa config.other.darkMode em vez de localStorage
			const isDark = this.config.other?.darkMode ?? false;

			if (isDark) {
				document.body.classList.add('dark');
			}

			if (darkToggle) {
				darkToggle.checked = isDark;
				console.log(`✅ Dark mode restaurado: ${isDark ? 'ATIVADO' : 'DESATIVADO'}`);
			}
		} catch (err) {
			console.warn('⚠️ Erro ao restaurar tema:', err);
		}

		debugLogConfig('Fim da função: "restoreTheme"');
	}

	restoreMode() {
		debugLogConfig('Início da função: "restoreMode"');
		try {
			const interviewModeSelect = document.getElementById('interviewModeSelect');
			const savedMode = localStorage.getItem('appMode') || 'NORMAL';

			globalThis.RendererAPI.changeMode(savedMode);
			if (interviewModeSelect) {
				interviewModeSelect.value = savedMode;

				interviewModeSelect.addEventListener('change', () => {
					const newMode = interviewModeSelect.value;
					globalThis.RendererAPI.changeMode(newMode);
					localStorage.setItem('appMode', newMode);
					console.log('🎯 Modo alterado:', newMode);
				});
			}

			console.log('🔁 Modo restaurado:', savedMode);
		} catch (err) {
			console.warn('⚠️ Erro ao restaurar modo:', err);
		}

		debugLogConfig('Fim da função: "restoreMode"');
	}

	async initClickThroughController() {
		debugLogConfig('Início da função: "initClickThroughController"');
		try {
			const btnToggle = document.getElementById('btnToggleClick');
			if (!btnToggle) return;

			let enabled = false;
			try {
				const saved = localStorage.getItem('clickThroughEnabled');
				enabled = saved === 'true';
			} catch (err) {
				console.warn('⚠️ Erro ao recuperar click-through state:', err);
			}

			await globalThis.RendererAPI.setClickThrough(enabled);
			globalThis.RendererAPI.updateClickThroughButton(enabled, btnToggle);

			btnToggle.addEventListener('click', async () => {
				enabled = !enabled;
				await globalThis.RendererAPI.setClickThrough(enabled);
				globalThis.RendererAPI.updateClickThroughButton(enabled, btnToggle);
				localStorage.setItem('clickThroughEnabled', enabled.toString());
				console.log('🖱️ Click-through alternado:', enabled);
			});

			document.querySelectorAll('.interactive-zone').forEach(el => {
				el.addEventListener('mouseenter', () => {
					_ipc.send('SET_INTERACTIVE_ZONE', true);
				});
				el.addEventListener('mouseleave', () => {
					_ipc.send('SET_INTERACTIVE_ZONE', false);
				});
			});
		} catch (err) {
			console.warn('⚠️ Erro ao inicializar click-through:', err);
		}

		debugLogConfig('Fim da função: "initClickThroughController"');
	}

	/**
	 * Aplica opacidade ao elemento root da app
	 * @param {number} value - Opacidade (0-1)
	 */
	applyOpacity(value) {
		debugLogConfig('Início da função: "applyOpacity"');
		const appOpacity = parseFloat(value);

		// aplica opacidade no conteúdo geral
		document.documentElement.style.setProperty('--app-opacity', appOpacity.toFixed(2));

		// topBar nunca abaixo de 0.75
		const topbarOpacity = Math.max(appOpacity, 0.75);
		document.documentElement.style.setProperty('--app-opacity-75', topbarOpacity.toFixed(2));

		localStorage.setItem('overlayOpacity', appOpacity);

		// logs
		console.log('🎚️ Opacity change | app:', value, '| topBar:', topbarOpacity);

		debugLogConfig('Fim da função: "applyOpacity"');
	}

	/**
	 * Inicializa drag handle para movimento de janela
	 * @param {element} dragHandle - Elemento para drag
	 */
	initDragHandle(dragHandle) {
		debugLogConfig('Início da função: "initDragHandle"');
		if (!dragHandle) {
			console.warn('⚠️ dragHandle não fornecido');
			return;
		}

		dragHandle.addEventListener('pointerdown', async event => {
			console.log('🪟 Drag iniciado (pointerdown)');

			dragHandle.classList.add('drag-active');

			const _pid = event.pointerId;
			try {
				dragHandle.setPointerCapture && dragHandle.setPointerCapture(_pid);
			} catch (err) {
				console.warn('setPointerCapture falhou:', err);
			}

			setTimeout(() => _ipc.send('START_WINDOW_DRAG'), 40);

			const startBounds = (await _ipc.invoke('GET_WINDOW_BOUNDS')) || {
				x: 0,
				y: 0,
			};
			const startCursor = { x: event.screenX, y: event.screenY };
			let lastAnimation = 0;

			const onPointerMove = ev => {
				const now = performance.now();
				if (now - lastAnimation < 16) return;
				lastAnimation = now;

				const dx = ev.screenX - startCursor.x;
				const dy = ev.screenY - startCursor.y;

				_ipc.send('MOVE_WINDOW_TO', {
					x: startBounds.x + dx,
					y: startBounds.y + dy,
				});
			};

			const onPointerUp = ev => {
				try {
					dragHandle.removeEventListener('pointermove', onPointerMove);
					dragHandle.removeEventListener('pointerup', onPointerUp);
				} catch (err) {}

				if (dragHandle.classList.contains('drag-active')) {
					dragHandle.classList.remove('drag-active');
				}

				try {
					dragHandle.releasePointerCapture && dragHandle.releasePointerCapture(_pid);
				} catch (err) {}
			};

			dragHandle.addEventListener('pointermove', onPointerMove);
			dragHandle.addEventListener('pointerup', onPointerUp, { once: true });
			event.stopPropagation();
		});

		document.addEventListener('pointerup', () => {
			if (!dragHandle.classList.contains('drag-active')) return;
			console.log('🪟 Drag finalizado (pointerup)');
			dragHandle.classList.remove('drag-active');
		});

		dragHandle.addEventListener('pointercancel', () => {
			if (dragHandle.classList.contains('drag-active')) {
				dragHandle.classList.remove('drag-active');
			}
		});

		debugLogConfig('Fim da função: "initDragHandle"');
	}

	/**
	 * Inicializa listener do botão de reset home
	 * Chamado durante initEventListeners()
	 */
	initResetButtonListener() {
		debugLogConfig('Início da função: "initResetButtonListener"');
		const resetBtn = document.getElementById('resetHomeBtn');
		if (resetBtn) {
			resetBtn.addEventListener('click', () => {
				const confirmed = confirm('⚠️ Isso vai limpar toda transcrição, histórico e respostas.\n\nTem certeza?');
				if (confirmed) {
					globalThis.RendererAPI?.resetAppState?.().then(() => {
						console.log('✅ Reset home concluído');
					});
				}
			});
			console.log('✅ Listener do botão reset instalado');
		} else {
			console.warn('⚠️ Botão reset não encontrado no DOM');
		}
		debugLogConfig('Fim da função: "initResetButtonListener"');
	}
}

// 🔥 MODIFICADO: Remove inicialização antiga de API key
document.addEventListener('DOMContentLoaded', async () => {
	debugLogConfig('Início da função: "DOMContentLoaded"');
	// 🔥 Espera pela disponibilidade de RendererAPI (carregado via renderer.js)
	let attempts = 0;
	while (!globalThis.RendererAPI && attempts < 50) {
		await new Promise(resolve => setTimeout(resolve, 100));
		attempts++;
	}

	if (!globalThis.RendererAPI) {
		console.error('❌ RendererAPI não foi carregado após timeout');
		return;
	}

	// ======================================================
	// 🔥 CONTROLLER INITIALIZATION
	// All event listeners and renderer service calls
	// ======================================================

	globalThis.configManager = new ConfigManager();

	await globalThis.configManager.initializeController();

	// 🔥 NOVO: Aguarda verificação inicial das API keys
	await globalThis.configManager.checkApiKeysStatus();

	// 🔥 NOVO: Atualiza UI dos modelos após carregar keys
	globalThis.configManager.updateModelStatusUI();

	console.log('✅ ConfigManager inicializado com sucesso');

	debugLogConfig('Fim da função: "DOMContentLoaded"');
});

/* ===============================
   FUNÇÃO PARA LOGAR 
=============================== */

/**
 * Log de debug padronizado para config-manager.js
 * Por padrão nunca loga, se quiser mostrar é só passar true.
 * @param {*} msg
 * @param {boolean} showLog - true para mostrar, false para ignorar
 */
function debugLogConfig(...args) {
	const maybeFlag = args.at(-1);
	const showLog = typeof maybeFlag === 'boolean' ? maybeFlag : false;

	const nowLog = new Date();
	const timeStr =
		`${nowLog.getHours().toString().padStart(2, '0')}:` +
		`${nowLog.getMinutes().toString().padStart(2, '0')}:` +
		`${nowLog.getSeconds().toString().padStart(2, '0')}.` +
		`${nowLog.getMilliseconds().toString().padStart(3, '0')}`;

	if (showLog) {
		const cleanArgs = typeof maybeFlag === 'boolean' ? args.slice(0, -1) : args;
		// prettier-ignore
		console.log(
			`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em config-manager.js:`, 
			'color: orange; font-weight: bold;', 
			...cleanArgs
		);
	}
}

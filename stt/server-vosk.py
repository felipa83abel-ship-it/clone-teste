#!/usr/bin/env python3
"""
Vosk Speech-to-Text Server for AskMe
Processa áudio em tempo real via stdin/stdout
Comunica com Node.js via IPC

Uso:
    python server-vosk.py                         # Usa modelo padrão (small-pt-0.3)
    python server-vosk.py vosk-models/vosk-model-pt-fb-v0.1.1  # Usa modelo maior
"""

import sys
import json
import os
import struct
import wave
from pathlib import Path

# Importações Vosk
try:
    from vosk import Model, KaldiRecognizer
    import pyaudio
except ImportError as e:
    print(f"ERRO: Biblioteca não instalada: {e}", file=sys.stderr)
    print("ERRO: Execute: pip install vosk pyaudio", file=sys.stderr)
    sys.exit(1)

class VoskTranscriber:
    # Inicializa Vosk com modelo português
    def __init__(self, model_path):
        """Inicializa Vosk com modelo português"""
        print(f"[VOSK] Carregando modelo: {model_path}", file=sys.stderr)
        
        # Verifica se modelo existe
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Modelo não encontrado: {model_path}\n"
                f"Baixe em: https://alphacephei.com/vosk/models\n"
                f"Descompacte em: ./vosk-models/"
            )
        
        try:
            self.model = Model(model_path)
            self.recognizer = KaldiRecognizer(self.model, 16000)
            self.accumulated_text = ""  # Acumula texto dos resultados finais até agora
            print("[VOSK] Modelo carregado com sucesso", file=sys.stderr)
        except Exception as e:
            raise RuntimeError(f"Erro ao carregar modelo Vosk: {e}")
    
    def extract_wav_audio(self, wav_data):
        """
        Extrai dados de áudio bruto (PCM) de um arquivo WAV
        Retorna: bytes PCM 16-bit 16kHz ou None se erro
        """
        try:
            import io
            # Trata WAV como arquivo em memória
            wav_file = io.BytesIO(wav_data)
            
            with wave.open(wav_file, 'rb') as w:
                # Lê header WAV
                n_channels = w.getnchannels()
                sample_rate = w.getframerate()
                n_frames = w.getnframes()
                
                print(f"[WAV] Canais: {n_channels}, Taxa: {sample_rate}Hz, Frames: {n_frames}", file=sys.stderr)
                
                # Lê dados brutos
                audio_data = w.readframes(n_frames)
                
                # Verifica se está no formato esperado
                if sample_rate != 16000:
                    print(f"[WAV] AVISO: Taxa esperada 16000Hz, recebida {sample_rate}Hz", file=sys.stderr)
                if n_channels != 1:
                    print(f"[WAV] AVISO: Esperado mono (1 canal), recebido {n_channels}", file=sys.stderr)
                
                return audio_data
        except Exception as e:
            print(f"[WAV] Erro ao ler WAV: {e}", file=sys.stderr)
            return None
    
    def transcribe_buffer(self, audio_buffer):
        """
        Processa buffer de áudio e retorna resultado
        Aceita: WAV file ou bytes PCM 16-bit
        
        Retorna: {"final": "texto", "partial": "texto", "isFinal": bool}
        """
        try:
            # Detecta se é WAV (começa com "RIFF")
            if audio_buffer.startswith(b'RIFF'):
                print("[VOSK] Detectado WAV, extraindo áudio...", file=sys.stderr)
                audio_buffer = self.extract_wav_audio(audio_buffer)
                if audio_buffer is None:
                    return {
                        "final": "",
                        "partial": "",
                        "isFinal": False,
                        "error": "Falha ao decodificar WAV"
                    }
            
            # Processa áudio PCM
            if self.recognizer.AcceptWaveform(audio_buffer):
                # Resultado final (silence detectado)
                import json as json_module
                result = json_module.loads(self.recognizer.Result())
                # Usa o campo 'text' do resultado do Vosk
                final_text = result.get("text", "").strip()
                
                # Acumula o texto final
                if final_text:
                    self.accumulated_text += (" " + final_text) if self.accumulated_text else final_text
                
                return {
                    "final": final_text,
                    "partial": "",
                    "isFinal": bool(final_text)
                }
            else:
                # Resultado parcial
                import json as json_module
                partial_result = json_module.loads(self.recognizer.PartialResult())
                partial_text = partial_result.get("partial", "")
                
                return {
                    "final": "",
                    "partial": partial_text,
                    "isFinal": False
                }
        except Exception as e:
            return {
                "final": "",
                "partial": "",
                "isFinal": False,
                "error": str(e)
            }
    
    def get_final_result(self):
        """
        Obtém o resultado acumulado até agora
        Inclui textos finais anteriores + resultado parcial atual
        """
        try:
            import json as json_module
            
            # Usa o FinalResult do reconhecedor para fechar a frase
            final_result = json_module.loads(self.recognizer.FinalResult())
            final_text = final_result.get("text", "").strip()
            
            # Combina com acumulado (se houver)
            if self.accumulated_text:
                final_text = (self.accumulated_text + (" " + final_text if final_text else "")).strip()
            
            return {
                "final": final_text,
                "partial": "",
                "isFinal": bool(final_text)
            }
        except Exception as e:
            return {
                "final": self.accumulated_text.strip(),
                "partial": "",
                "isFinal": bool(self.accumulated_text.strip()),
                "error": str(e)
            }
    
    def reset(self):
        """Reseta reconhecedor para próximo ciclo"""
        try:
            self.accumulated_text = ""  # Limpa o acumulado
            self.recognizer.Reset()
            return {"status": "reset"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

def main(): # NOSONAR
    """Loop principal de processamento"""
    print("[VOSK] Iniciando servidor...", file=sys.stderr)
    
    # Define o modelo a usar (padrão: pequeno e mais rápido)
    # Pode ser sobrescrito via argumento de linha de comando
    # vosk-model-small-pt-0.3 ou vosk-model-pt-fb-v0.1.1
    model_path = sys.argv[1] if len(sys.argv) > 1 else "vosk-models/vosk-model-small-pt-0.3"
    
    if len(sys.argv) > 1:
        print(f"[VOSK] Usando modelo especificado: {model_path}", file=sys.stderr)
    else:
        print(f"[VOSK] Usando modelo padrão: {model_path}", file=sys.stderr)
    
    try:
        transcriber = VoskTranscriber(model_path)
    except Exception as e:
        print(f"[VOSK] ERRO ao inicializar: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Sinaliza que está pronto para Node.js
    print("VOSK_READY", flush=True)
    print("[VOSK] Servidor pronto e aguardando comandos", file=sys.stderr)
    
    try:
        while True:
            # Lê comando de stdin (JSON)
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                
                # DEBUG
                print(f"[VOSK] Recebido: {len(line)} bytes", file=sys.stderr)
                
                # Interpreta comando
                command = json.loads(line)
                cmd_type = command.get("type")
                
                if cmd_type == "transcribe":
                    # Transcreve buffer de áudio (enviado como base64)
                    import base64
                    audio_data = base64.b64decode(command.get("audio", ""))
                    result = transcriber.transcribe_buffer(audio_data)
                    print(json.dumps(result), flush=True)
                
                elif cmd_type == "finalize":
                    # Obtém resultado final acumulado e reseta
                    result = transcriber.get_final_result()
                    print(json.dumps(result), flush=True)
                    # Reseta depois de retornar o final
                    transcriber.reset()
                
                elif cmd_type == "reset":
                    # Reseta reconhecedor
                    result = transcriber.reset()
                    print(json.dumps(result), flush=True)
                
                elif cmd_type == "ping":
                    # Keep-alive
                    print(json.dumps({"status": "pong"}), flush=True)
                
                else:
                    print(json.dumps({"error": f"Comando desconhecido: {cmd_type}"}), flush=True)
            
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"JSON inválido: {e}"}), flush=True)
            except Exception as e:
                print(json.dumps({"error": str(e)}), flush=True)
    
    except KeyboardInterrupt:
        print("[VOSK] Encerrando...", file=sys.stderr)
    except Exception as e:
        print(f"[VOSK] Erro crítico: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

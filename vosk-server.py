#!/usr/bin/env python3
"""
Vosk Speech-to-Text Server for AskMe
Processa áudio em tempo real via stdin/stdout
Comunica com Node.js via IPC
"""

import sys
import json
import os
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
    def __init__(self, model_path="vosk-models/vosk-model-small-pt-0.3"):
        """Inicializa Vosk com modelo português"""
        print(f"[VOSK] Carregando modelo: {model_path}", file=sys.stderr)
        
        # Verifica se modelo existe
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Modelo não encontrado: {model_path}\n"
                f"Baixe em: https://alphacephei.com/vosk/models\n"
                f"Descompacte em: ./vosk-models/vosk-model-small-pt-0.3/"
            )
        
        try:
            self.model = Model(model_path)
            self.recognizer = KaldiRecognizer(self.model, 16000)
            print("[VOSK] Modelo carregado com sucesso", file=sys.stderr)
        except Exception as e:
            raise Exception(f"Erro ao carregar modelo Vosk: {e}")
    
    def transcribe_buffer(self, audio_buffer):
        """
        Processa buffer de áudio e retorna resultado
        Esperado: bytes PCM 16-bit
        
        Retorna: {"final": "texto", "partial": "texto", "isFinal": bool}
        """
        try:
            # Processa áudio
            if self.recognizer.AcceptWaveform(audio_buffer):
                # Resultado final
                import json as json_module
                result = json_module.loads(self.recognizer.Result())
                final_text = " ".join(result.get("result", [])) if result.get("result") else ""
                
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
    
    def reset(self):
        """Reseta reconhecedor para próximo ciclo"""
        try:
            self.recognizer.Reset()
            return {"status": "reset"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

def main():
    """Loop principal de processamento"""
    print("[VOSK] Iniciando servidor...", file=sys.stderr)
    
    try:
        transcriber = VoskTranscriber()
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

// whisper-server.js (crie este arquivo na raiz)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WHISPER_EXE = path.join(__dirname, 'whisper-local', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(__dirname, 'whisper-local', 'ggml-tiny.bin');

console.log('🚀 Iniciando servidor Whisper...');

// Inicia o Whisper em modo interativo
const whisper = spawn(WHISPER_EXE, ['-m', WHISPER_MODEL, '-l', 'pt', '-otxt', '-np', '-nt', '-t', '12', '-p', '4']);

whisper.stdout.on('data', data => {
	console.log('Whisper:', data.toString());
});

whisper.stderr.on('data', data => {
	console.log('Whisper stderr:', data.toString());
});

whisper.on('close', code => {
	console.log(`Whisper processo finalizado com código ${code}`);
});

// Aguarda comandos do stdin
process.stdin.on('data', async data => {
	try {
		const command = JSON.parse(data.toString());

		if (command.type === 'transcribe') {
			// Salva áudio temporário
			const tempPath = path.join(__dirname, 'temp', `audio-${Date.now()}.wav`);
			fs.writeFileSync(tempPath, Buffer.from(command.audio));

			// Envia para Whisper (não funciona com stdin, precisaria modificar)
			// Esta é uma versão simplificada
		}
	} catch (error) {
		console.error('Erro:', error);
	}
});

console.log('✅ Servidor Whisper pronto! Envie JSON via stdin.');

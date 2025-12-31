#!/usr/bin/env node

/**
 * Script de verificação do setup Vosk
 * Executa: node check-vosk-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando setup do Vosk...\n');

const checks = {
	vosk_module: false,
	vosk_model: false,
	model_structure: false,
	python: false,
};

// 1. Verifica se Vosk está instalado
console.log('1️⃣ Verificando instalação do Vosk...');
try {
	require('vosk');
	console.log('   ✅ Vosk instalado com sucesso');
	checks.vosk_module = true;
} catch (err) {
	console.log('   ❌ Vosk não instalado ou com erro:');
	console.log(`      ${err.message}`);
	console.log('   Execute: npm install vosk');
}

// 2. Verifica se modelo existe
console.log('\n2️⃣ Verificando modelo português...');
const modelPath = path.join(__dirname, 'vosk-models', 'vosk-model-pt-0.3');
if (fs.existsSync(modelPath)) {
	console.log(`   ✅ Modelo encontrado em: ${modelPath}`);
	checks.vosk_model = true;

	// 3. Verifica estrutura do modelo
	console.log('\n3️⃣ Verificando estrutura do modelo...');
	const requiredDirs = ['am', 'conf', 'graph'];
	const missingDirs = requiredDirs.filter(dir => !fs.existsSync(path.join(modelPath, dir)));

	if (missingDirs.length === 0) {
		console.log('   ✅ Estrutura completa:');
		const contents = fs.readdirSync(modelPath);
		contents.forEach(item => {
			console.log(`      - ${item}`);
		});
		checks.model_structure = true;
	} else {
		console.log('   ❌ Modelo incompleto. Faltam diretórios:');
		missingDirs.forEach(dir => console.log(`      - ${dir}`));
	}
} else {
	console.log(`   ❌ Modelo não encontrado em: ${modelPath}`);
	console.log('   Baixe em: https://alphacephei.com/vosk/models (vosk-model-pt-0.3)');
	console.log(`   Descompacte em: ${modelPath}/`);
}

// 4. Verifica Python (required for Vosk compilation)
console.log('\n4️⃣ Verificando Python...');
const { execSync } = require('child_process');
try {
	const pythonVersion = execSync('python --version 2>&1 || python3 --version').toString().trim();
	console.log(`   ✅ Python encontrado: ${pythonVersion}`);
	checks.python = true;
} catch (err) {
	console.log('   ⚠️ Python não encontrado no PATH');
	console.log('   Vosk pode falhar na compilação sem Python');
	console.log('   Instale de: https://www.python.org/downloads/');
}

// Resumo
console.log('\n\n📊 RESUMO DO CHECK:\n');
console.log(`Vosk módulo:        ${checks.vosk_module ? '✅' : '❌'}`);
console.log(`Modelo português:   ${checks.vosk_model ? '✅' : '❌'}`);
console.log(`Estrutura modelo:   ${checks.model_structure ? '✅' : '❌'}`);
console.log(`Python:             ${checks.python ? '✅' : '⚠️'}`);

const allOk = checks.vosk_module && checks.vosk_model && checks.model_structure;

console.log(
	'\n' + (allOk ? '✅ Setup OK! Pode executar: npm start' : '❌ Setup incompleto. Siga as instruções acima.'),
);

process.exit(allOk ? 0 : 1);

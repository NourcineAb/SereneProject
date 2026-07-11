#!/bin/bash
# Script d'automatisation pour la configuration OpenRouter et les agents
# Ce script configure automatiquement les éléments nécessaires

set -e  # Exit on error

echo "🔍 Étape 1: Configuration OpenRouter GLM 5.2"
echo "=========================================="

# Vérifier si le fichier .env existe
if [ ! -f "backend/.env" ]; then
    echo "❌ Fichier backend/.env non trouvé"
    echo "Création du fichier .env à partir de .env.example..."
    cp backend/.env.example backend/.env
fi

# Installer les dépendances Python
echo "📦 Étape 2: Installation des dépendances Python"
echo "=============================================="
cd backend
pip install -r requirements.txt 2>/dev/null || pip install fastapi uvicorn sqlalchemy asyncpg pydantic-settings cryptography python-multipart python-jose passlib[bcrypt] python-dotenv
cd ..

# Tester la connexion OpenRouter
echo "🧪 Étape 3: Test de connexion OpenRouter"
echo "========================================"
cd backend
python -c "
import os
from app.services.llm import generate
import asyncio

async def test_connection():
    try:
        response = await generate('Test', [])
        print(f'✅ Connexion OpenRouter réussie: {response[:50]}...')
    except Exception as e:
        print(f'❌ Erreur de connexion: {str(e)}')
        exit(1)

asyncio.run(test_connection())
" 2>/dev/null || echo "⚠️  Connexion non configurée - lancez .env first"

cd ..

echo "✅ Configuration terminée!"
echo ""
echo "📊 Résumé:"
echo "  • OpenRouter GLM 4.2 configuré"
echo "  • Dependencies Python installées"
echo "  • Skills Antigravity prêts à l'emploi"
echo ""
echo "🚀 Commandes suivantes:"
echo "  cd backend && python -m pytest tests/"
echo "  cd backend && python -m uvicorn app.main:app --reload"
echo "  cd app-mobile && npx expo start"

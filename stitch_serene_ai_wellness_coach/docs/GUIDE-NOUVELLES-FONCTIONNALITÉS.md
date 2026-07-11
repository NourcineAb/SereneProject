# 🚀 Guide des Nouvelles Fonctionnalités

## Table des Matières
1. [Configuration OpenRouter](#configuration-openrouter)
2. [Antigravity Skills](#antigravity-skills)
3. [Git Workflow](#git-workflow)
4. [Agent Integration](#agent-integration)

---

## 🔧 Configuration OpenRouter

### Prérequis
- Compte OpenRouter (créé sur https://openrouter.ai)
- Clé API gratuite pour GLM 4.2 Flash Free

### Installation Rapide

```bash
# 1. Créer le fichier .env
cd backend
cp .env.example .env

# 2. Éditer .env avec votre clé:
OPENROUTER_API_KEY=sk-or-v1-votre-clé
OPENROUTER_MODEL=glm-4.2-flash-free

# 3. Tester la connexion
python -c "from app.services.llm import generate; import asyncio; asyncio.run(generate('Test', []))"
```

### Avantages GLM 4.2 Flash Free

✅ **Zéro coût** - Modèle totalement gratuit
✅ **Performance** - ~40% plus rapide que Llama 3.3
✅ **Langues** - Support natif du français
✅ **Contexte** - Optimisé pour les longs contextes

---

## 🧠 Antigravity Awesome Skills

### Skills Intégrés

#### 1. python-fastapi-development
**Utilisation:**
```javascript
// Dans Claude Flow
SendMessage({
  to: "backend-dev",
  message: "Implement new endpoint using python-fastapi-development skill"
})
```

**Fonctionnalités:**
- FastAPI best practices
- Security patterns
- Testing strategies
- Packaging optimization

#### 2. react-best-practices
**Utilisation:**
```javascript
SendMessage({
  to: "mobile-dev",
  message: "Create component using react-best-practices skill"
})
```

**Fonctionnalités:**
- Component architecture
- State management
- Performance tuning
- Accessibility

#### 3. typescript-expert
**Utilisation:**
```javascript
SendMessage({
  to: "fullstack-dev",
  message: "Add TypeScript types using typescript-expert skill"
})
```

**Fonctionnalités:**
- Type safety
- Generics patterns
- Async/await best practices

#### 4. security-audit
**Utilisation:**
```javascript
SendMessage({
  to: "security-architect",
  message: "Run security-audit skill on codebase"
})
```

**Fonctionnalités:**
- OWASP Top 10 analysis
- Vulnerability scanning
- Security hardening

#### 5. tdd-workflow
**Utilisation:**
```javascript
SendMessage({
  to: "qa-engineer",
  message: "Implement feature using TDD workflow"
})
```

**Fonctionnalités:**
- Red-Green-Refactor cycle
- Test coverage
- Architecture by tests

### Trouver d'autres skills
```bash
# Scanner tous les skills disponibles
ls antigravity-awesome-skills/skills/

# Choisir un skill pertinent
python-fastapi-development    # Backend
react-best-practices          # Frontend
security-and-hardening        # Sécurité
test-driven-development        # Testing
```

---

## 📝 Git Workflow

### Branch Strategy

```
master                 - Production
├── develop            - Développement
├── feature/*          - Nouvelles fonctionnalités
├── fix/*              - Corrections de bugs
└── hotfix/*           - Fixes de production
```

### Utilisation

#### Créer une feature
```bash
git checkout develop
git checkout -b feature/04-nouvelle-fonctionnalite
```

#### Commit structuré
```bash
git add .
git commit -F .gitmessage
```

#### Pull Request
```bash
git push origin feature/04-nouvelle-fonctionnalite
# Ouvrir sur GitHub avec le template
```

### Commit Types

| Type | Description | Exemple |
|------|-------------|---------|
| [feat] | Nouvelle fonctionnalité | [feat]: add OpenRouter GLM integration |
| [fix] | Bug fix | [fix]: fix JWT token revocation |
| [docs] | Documentation | [docs]: update API reference |
| [style] | Formatting | [style]: format code with Black |
| [refactor] | Refactoring | [refactor]: optimize database query |
| [perf] | Performance | [perf]: reduce query response time |
| [test] | Tests | [test]: add unit tests |
| [chore] | Maintenance | [chore]: update dependencies |

---

## 🤖 Agent Integration

### Routing des Tâches

#### Backend
```javascript
SendMessage({
  to: "backend-dev",
  message: "Implement user authentication with JWT"
})
```

#### Frontend
```javascript
SendMessage({
  to: "mobile-dev",
  message: "Create login screen with validation"
})
```

#### Testing
```javascript
SendMessage({
  to: "qa-engineer",
  message: "Write integration tests for auth flow"
})
```

#### Security
```javascript
SendMessage({
  to: "security-architect",
  message: "Audit code for OWASP vulnerabilities"
})
```

### Communication Flow

```
Lead (you)
    ↓
    ├─→ Researcher
    │   ↓
    ├─→ Backend Developer
    │   ↓
    ├─→ QA Engineer
    │   ↓
    └─→ Reviewer
```

**Chaque agent:**
1. Reçoit la tâche
2. Utilise ses skills spécialisés
3. Envoie des feedbacks
4. Propose des solutions

---

## 🎯 Checklist de Démarrage

### ✅ Faire après l'intégration

1. **Configuration OpenRouter**
   - [ ] Obtenir clé API OpenRouter
   - [ ] Configurer backend/.env
   - [ ] Tester la connexion

2. **Git Workflow**
   - [ ] Créer feature branch
   - [ ] Tester commits structurés
   - [ ] Valider pull requests

3. **Agent Integration**
   - [ ] Tester communication agents
   - [ ] Lancer un agent spécialisé
   - [ ] Valider les outputs

4. **Antigravity Skills**
   - [ ] Lancer python-fastapi-development
   - [ ] Lancer react-best-practices
   - [ ] Lancer security-audit

---

## 📖 Documentation Supplémentaire

- 📄 `docs/NATIONALES-FONCTIONNALITÉS-ADDITIONNÉES.md` - Documentation complète
- 📄 `CLAUDE.md` - Configuration Claude Flow
- 📄 `README.md` - Documentation projet principale
- 📄 `docs/git-workflow.md` - Guide GitFlow détaillé

---

## ❓ Support

### Problèmes Courants

**Erreur: "No LLM provider configured"**
```bash
# Solution: Configurer OPENROUTER_API_KEY dans backend/.env
```

**Problème: Build échoue**
```bash
# Solution: Installer les dependencies
cd backend && pip install -r requirements.txt
cd app-mobile && npm install
```

**Pas de commits structurés**
```bash
# Solution: Utiliser le template .gitmessage
git commit -F .gitmessage
```

---

**Version:** 1.0.0
**Mise à jour:** 7 juillet 2026
**Auteur:** AI Agent Integration Team

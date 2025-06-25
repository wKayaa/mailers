# Turbo SMTP Mailer avec Rotation

Un système d'envoi d'emails en masse avec rotation avancée des expéditeurs et des serveurs SMTP pour améliorer la délivrabilité.

## Fonctionnalités

### Rotation Automatique ✨
- **Rotation des noms d'expéditeur** : 8 noms professionnels (Support, Help Desk, Customer Service, etc.)
- **Rotation des serveurs SMTP** : 5 endpoints AWS SES dans différentes régions
- **Rotation des sujets** : Maintient la rotation existante des sujets d'email
- **Distribution intelligente** : Chaque email utilise une combinaison différente

### Modes d'utilisation
1. **Rotation automatique** : Utilise la configuration prédéfinie avec rotation complète
2. **Configuration manuelle** : Mode traditionnel avec saisie manuelle des paramètres

## Configuration

### config.json
```json
{
  "smtp": {
    "host": "email-smtp.eu-west-2.amazonaws.com",
    "auth": {
      "user": "YOUR_AWS_ACCESS_KEY",
      "pass": "YOUR_AWS_SECRET_KEY"
    }
  },
  "rotation": {
    "enabled": true,
    "senderNames": [
      "Support",
      "Help Desk", 
      "Customer Service",
      "Technical Support",
      "Service Team",
      "Customer Care",
      "Client Support",
      "Assistance Team"
    ],
    "smtpHosts": [
      "email-smtp.eu-west-2.amazonaws.com",
      "email-smtp.us-west-2.amazonaws.com",
      "email-smtp.us-east-1.amazonaws.com",
      "email-smtp.eu-central-1.amazonaws.com",
      "email-smtp.ap-southeast-1.amazonaws.com"
    ]
  }
}
```

### Paramètres de rotation
- `rotation.enabled` : Active/désactive la rotation (true/false)
- `rotation.senderNames` : Liste des noms d'expéditeur à utiliser en rotation
- `rotation.smtpHosts` : Liste des serveurs SMTP AWS SES à utiliser en rotation

## Utilisation

```bash
node sender.js
```

Le programme vous guidera à travers :
1. Sélection du template HTML
2. Fichier des destinataires
3. **Choix du mode** : Rotation automatique ou configuration manuelle
4. Configuration des paramètres d'envoi

## Avantages de la rotation

### Amélioration de la délivrabilité
- **Distribution du volume** : Répartit l'envoi sur plusieurs identités et serveurs
- **Réduction des limites** : Évite les limitations par expéditeur/serveur
- **Meilleure réputation** : Maintient une réputation distribuée

### Compatibilité avec les fournisseurs
- **Yahoo** : Meilleure acceptance avec des expéditeurs variés
- **Gmail** : Réduction du risque de blocage par volume
- **Outlook** : Distribution améliore le passage en boîte de réception

## Structure des fichiers

```
mailers/
├── sender.js          # Script principal avec rotation
├── config.json        # Configuration SMTP et rotation
├── subjects.txt       # Sujets d'emails (un par ligne)
├── letters/           # Templates HTML
│   ├── template1.html
│   └── template2.html
└── recipients.txt     # Fichier des destinataires
```

## Compatibilité

- ✅ **Rétrocompatible** : Fonctionne avec les configurations existantes
- ✅ **Mode manuel** : Possibilité de désactiver la rotation
- ✅ **Configuration flexible** : Adaptation facile aux besoins spécifiques

## Exemple de sortie avec rotation

```
📨 Envoi avec rotation: 8 noms, 5 hosts, 5 envois simultanés...

✔ user1@example.com | Sujet: Subject 1 | De: Support | Host: email-smtp.eu-west-2.amazonaws.com
✔ user2@example.com | Sujet: Subject 2 | De: Help Desk | Host: email-smtp.us-west-2.amazonaws.com
✔ user3@example.com | Sujet: Subject 3 | De: Customer Service | Host: email-smtp.us-east-1.amazonaws.com
```

## Sécurité

⚠️ **Important** : Gardez vos identifiants AWS SES sécurisés et ne les commitez jamais dans le code source.
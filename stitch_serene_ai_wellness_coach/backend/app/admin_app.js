/* Serene Backoffice — single-page vanilla JS app
   Multilingual (fr/en/ar) + Light/Dark theme + RTL-aware.
   Business logic (API calls, filters, mutations) is unchanged. */
const API = window.location.origin;
let token = localStorage.getItem('admin_token');
let charts = {};
let currentPage = 1;
let searchTimeout = null;
let activeTab = 'dashboard';

/* ═════════════════════ i18n ═════════════════════ */
const TRANSLATIONS = {
  fr: {
    'nav.dashboard':'Dashboard','nav.analytics':'Analytics','nav.users':'Utilisateurs',
    'nav.subscriptions':'Abonnements','nav.payments':'Paiements','nav.ai':'IA',
    'nav.notifications':'Notifications','nav.audit':'Audit','nav.system':'Système',
    'nav.logout':'Déconnexion',
    'prefs.language':'Langue','prefs.theme':'Thème','prefs.light':'Clair','prefs.dark':'Sombre',
    'login.welcome':'Bienvenue','login.subtitle':'Connectez-vous au backoffice',
    'login.email':'Email','login.password':'Mot de passe','login.submit':'Se connecter',
    'login.error':'Erreur de connexion','common.error':'Erreur','common.loading':'Chargement...',
    'common.name':'Nom','common.email':'Email','common.user':'Utilisateur','common.close':'Fermer',
    'common.vie':'Voir','common.page':'Page','common.defaultError':"Erreur de chargement",
    'common.noData':'Aucune donnée',
    'dashboard.subtitle':"Vue d'ensemble de votre application wellness",
    'dashboard.moodTrend':"Tendance d'humeur (7 jours)",
    'dashboard.techUsed':'Techniques utilisées (7 jours)',
    'dashboard.users':'Utilisateurs','dashboard.premium':'Premium',
    'dashboard.activeSubs':'Abonnements actifs','dashboard.paidPayments':'Paiements réussis',
    'dashboard.sessions7':'Sessions (7j)','dashboard.aiRequests7':'Requêtes IA (7j)',
    'dashboard.activeUsers7':'Actifs (7j)',
    'dashboard.thisWeek':'cette semaine','dashboard.conversion':'% conversion',
    'dashboard.trials':'essais','dashboard.canceled':'annulés','dashboard.errors':'erreurs',
    'dashboard.revenue':'revenus','dashboard.total':'au total','dashboard.sessions':'sessions',
    'dashboard.moodAvg':'Humeur moy.','dashboard.entries':'Saisies','dashboard.noChartData':'Aucune donnée',
    'analytics.subtitle':'Croissance, activité et revenus sur 30 jours',
    'analytics.users':'Utilisateurs','analytics.premium':'Premium','analytics.premiumRate':'% premium','analytics.totalSessions':'Sessions',
    'analytics.allMessages':'Messages','analytics.userGrowth':'Croissance utilisateurs (30j)',
    'analytics.sessions':'Sessions','analytics.messages':'Messages','analytics.revenue':'Revenus (30j)',
    'analytics.activeSubs':'Abonnés actifs','analytics.aiUsage':'Usage IA (30j)',
    'analytics.retention':'Rétention par cohorte','analytics.cohort':'Cohorte',
    'analytics.new':'Nouveaux','analytics.newUsers':'Nouveaux','analytics.revenueLabel':'Revenus ($)',
    'analytics.subscribers':'Abonnés','analytics.cohortDay':'J','analytics.na':'N/A',
    'users.subtitle':'Gérer les comptes et le support',
    'users.search':'Rechercher par nom ou email...',
    'users.filterPremium':'Statut premium','users.premium':'Premium','users.free':'Gratuit',
    'users.filterActivity':'Activité 7j','users.active':'Actif','users.inactive':'Inactif',
    'users.filterSuspended':'Suspension','users.suspended':'Suspendu(s)','users.notSuspended':'Non suspendus',
    'users.sessions':'Sessions','users.status':'Statut','users.activity':'Activité',
    'users.joined':'Inscrit','users.lastLogin':'Dernière connexion',
    'users.noUsers':'Aucun utilisateur trouvé','users.admin':'Admin','users.banned':'Suspendu',
    'users.premiumBadge':'Premium','users.freeBadge':'Gratuit','users.activeBadge':'Actif',
    'users.view':'Voir','users.userDetail':'Détails utilisateur',
    'users.techniques':'Techniques utilisées','users.moodsRecent':'Humeurs récentes',
    'users.sessionsLabel':'Sessions','users.joinedOn':'Inscrit le','users.totalSessions':'Sessions totales',
    'users.sessions7d':'Sessions (7j)','users.totalMessages':'Messages totaux','users.messages7d':'Messages (7j)',
    'users.moodCount':'Humeurs','users.exercises':'Exercices','users.avgMood':'Humeur moy.',
    'users.avgMood7d':'Humeur moy. (7j)','users.lastConnexion':'Dernière connexion','users.statusLabel':'Statut',
    'users.editName':'Nom','users.editEmail':'Email','users.grantPremium':'Accorder Premium',
    'users.removePremium':'Retirer Premium','users.grantAdmin':'Accorder Admin','users.removeAdmin':'Retirer Admin',
    'users.reactivate':'Réactiver','users.suspend':'Suspendre','users.save':'Enregistrer','users.delete':'Supprimer',
    'users.confirmSuspend':'Suspendre cet utilisateur ?',
    'users.confirmDelete':'Supprimer définitivement ce compte ? Cette action est irréversible.',
    'users.updated':'Utilisateur mis à jour',
    'subscriptions.subtitle':'Abonnés, revenus et expirations',
    'subscriptions.allStatuses':'Tous les statuts','subscriptions.active':'Active',
    'subscriptions.trial':'Essai','subscriptions.canceled':'Annulée','subscriptions.expired':'Expirée',
    'subscriptions.allProviders':'Tous les fournisseurs','subscriptions.plan':'Plan',
    'subscriptions.status':'Statut','subscriptions.type':'Type','subscriptions.provider':'Fournisseur',
    'subscriptions.price':'Prix','subscriptions.start':'Début','subscriptions.end':'Fin',
    'subscriptions.expiringSoon':'Expirations à venir (7 jours)','subscriptions.noSub':'Aucun abonnement',
    'subscriptions.noExpiring':"Aucune expiration à venir",
    'subscriptions.activeLabel':'Actives','subscriptions.trialsLabel':'Essais',
    'subscriptions.canceledLabel':'Annulées','subscriptions.mrr':'MRR',
    'subscriptions.thisMonth':'$ ce mois','subscriptions.expiring7':'Expirent < 7j','subscriptions.total':'$ total',
    'subscriptions.view':'Voir','subscriptions.trialBadge':'Essai',
    'payments.subtitle':'Transactions, revenus et statuts de paiement',
    'payments.allStatuses':'Tous les statuts','payments.succeeded':'Réussi','payments.pending':'En attente',
    'payments.failed':'Échoué','payments.refunded':'Remboursé','payments.canceled':'Annulé',
    'payments.allProviders':'Tous les fournisseurs','payments.amount':'Montant','payments.currency':'Devise',
    'payments.status':'Statut','payments.provider':'Fournisseur','payments.source':'Source',
    'payments.paymentId':'ID paiement','payments.date':'Date','payments.noPayments':'Aucun paiement',
    'payments.totalRevenue':'Revenus totaux','payments.thisMonth':'Ce mois','payments.succeededCount':'Réussis',
    'payments.failedCount':'Échoués','payments.pendingCount':'En attente',
    'ai.title':'Monitoring IA','ai.subtitle':'Usage réel du LLM, latence et erreurs',
    'ai.requestsPerDay':'Requêtes IA par jour (30j)','ai.modelsUsed':'Modèles utilisés',
    'ai.model':'Modèle','ai.requests':'Requêtes','ai.errors':'Erreurs','ai.avgLatency':'Latence moy.',
    'ai.tokens':'Tokens','ai.recentErrors':'Erreurs récentes','ai.date':'Date',
    'ai.noErrors':'Aucune erreur récente','ai.noData':'Aucune donnée',
    'ai.requestsLabel':'Requêtes','ai.errorLabel':'Erreurs','ai.latencyMs':'Latence (ms)',
    'ai.totalRequests':'Requêtes','ai.ok':'OK','ai.avgLatencyLabel':'Latence moy.','ai.tokensLabel':'Tokens',
    'ai.prompt':'prompt','ai.completion':'compl.',
    'notifications.subtitle':"Envoyer des notifications push et consulter l'historique",
    'notifications.newTitle':'Nouvelle notification','notifications.titleLabel':'Titre',
    'notifications.titlePlaceholder':'Titre de la notification','notifications.bodyLabel':'Contenu',
    'notifications.bodyPlaceholder':'Votre message...','notifications.targetLabel':'Cible',
    'notifications.targetAll':'Tous les utilisateurs','notifications.targetPremium':'Abonnés premium',
    'notifications.targetFree':'Utilisateurs gratuits','notifications.targetSpecific':'Utilisateur précis',
    'notifications.userId':'ID utilisateur','notifications.userIdPlaceholder':"ID de l'utilisateur",
    'notifications.send':'Envoyer','notifications.history':'Historique',
    'notifications.statusLabel':'Statut','notifications.sent':'Envoyées','notifications.failed':'Échecs',
    'notifications.date':'Date','notifications.noNotif':'Aucune notification envoyée',
    'notifications.sending':'Envoi...','notifications.userRequired':'ID utilisateur requis',
    'notifications.sentCount':'notifications envoyées',
    'notifications.sentBadge':'Envoyée','notifications.partialBadge':'Partielle','notifications.failedBadge':'Échec',
    'audit.title':"Journal d'audit",'audit.subtitle':'Traçabilité des actions administrateurs',
    'audit.allActions':'Toutes les actions','audit.action':'Action','audit.admin':'Admin',
    'audit.target':'Cible','audit.details':'Détails','audit.result':'Résultat','audit.date':'Date',
    'audit.noActions':"Aucune action enregistrée",'audit.ok':'OK','audit.err':'Err',
    'system.subtitle':"État de l'infrastructure et erreurs serveur",
    'system.recentErrors':'Erreurs récentes','system.source':'Source','system.route':'Route',
    'system.message':'Message','system.detail':'Détail','system.date':'Date','system.noErrors':'Aucune erreur enregistrée',
    'system.database':'Base de données','system.status':'Statut','system.connected':'Connectée',
    'system.dbError':'Erreur','system.errors24h':'Erreurs (24h)','system.config':'Configuration',
    'system.environment':'Environnement','system.llm':'LLM','system.monetization':'Monétisation',
    'system.freeSessions':'Sessions gratuites','system.rateLimiting':'Rate limiting',
    'system.encryption':'Chiffrement PII','system.premiumPrice':'Prix premium','system.cors':'Origines CORS',
    'system.enabled':'Activé','system.disabled':'Désactivé','system.perWeek':'/sem',
  },
  en: {
    'nav.dashboard':'Dashboard','nav.analytics':'Analytics','nav.users':'Users',
    'nav.subscriptions':'Subscriptions','nav.payments':'Payments','nav.ai':'AI',
    'nav.notifications':'Notifications','nav.audit':'Audit','nav.system':'System',
    'nav.logout':'Log out',
    'prefs.language':'Language','prefs.theme':'Theme','prefs.light':'Light','prefs.dark':'Dark',
    'login.welcome':'Welcome','login.subtitle':'Sign in to the backoffice',
    'login.email':'Email','login.password':'Password','login.submit':'Sign in',
    'login.error':'Connection error','common.error':'Error','common.loading':'Loading...',
    'common.name':'Name','common.email':'Email','common.user':'User','common.close':'Close',
    'common.vie':'View','common.page':'Page','common.defaultError':'Failed to load',
    'common.noData':'No data',
    'dashboard.subtitle':'Overview of your wellness app',
    'dashboard.moodTrend':'7-day mood trend',
    'dashboard.techUsed':'Techniques used (7 days)',
    'dashboard.users':'Users','dashboard.premium':'Premium',
    'dashboard.activeSubs':'Active subscriptions','dashboard.paidPayments':'Successful payments',
    'dashboard.sessions7':'Sessions (7d)','dashboard.aiRequests7':'AI requests (7d)',
    'dashboard.activeUsers7':'Active (7d)',
    'dashboard.thisWeek':'this week','dashboard.conversion':'% conversion',
    'dashboard.trials':'trials','dashboard.canceled':'canceled','dashboard.errors':'errors',
    'dashboard.revenue':'revenue','dashboard.total':'total','dashboard.sessions':'sessions',
    'dashboard.moodAvg':'Avg mood','dashboard.entries':'Entries','dashboard.noChartData':'No data',
    'analytics.subtitle':'Growth, activity and revenue over 30 days',
    'analytics.users':'Users','analytics.premium':'Premium','analytics.premiumRate':'% premium','analytics.totalSessions':'Sessions',
    'analytics.allMessages':'Messages','analytics.userGrowth':'User growth (30d)',
    'analytics.sessions':'Sessions','analytics.messages':'Messages','analytics.revenue':'Revenue (30d)',
    'analytics.activeSubs':'Active subscribers','analytics.aiUsage':'AI usage (30d)',
    'analytics.retention':'Cohort retention','analytics.cohort':'Cohort',
    'analytics.new':'New','analytics.newUsers':'New','analytics.revenueLabel':'Revenue ($)',
    'analytics.subscribers':'Subscribers','analytics.cohortDay':'D','analytics.na':'N/A',
    'users.subtitle':'Manage accounts and support',
    'users.search':'Search by name or email...',
    'users.filterPremium':'Premium status','users.premium':'Premium','users.free':'Free',
    'users.filterActivity':'7d activity','users.active':'Active','users.inactive':'Inactive',
    'users.filterSuspended':'Suspension','users.suspended':'Suspended','users.notSuspended':'Not suspended',
    'users.sessions':'Sessions','users.status':'Status','users.activity':'Activity',
    'users.joined':'Joined','users.lastLogin':'Last login',
    'users.noUsers':'No users found','users.admin':'Admin','users.banned':'Suspended',
    'users.premiumBadge':'Premium','users.freeBadge':'Free','users.activeBadge':'Active',
    'users.view':'View','users.userDetail':'User details',
    'users.techniques':'Techniques used','users.moodsRecent':'Recent moods',
    'users.sessionsLabel':'Sessions','users.joinedOn':'Joined on','users.totalSessions':'Total sessions',
    'users.sessions7d':'Sessions (7d)','users.totalMessages':'Total messages','users.messages7d':'Messages (7d)',
    'users.moodCount':'Moods','users.exercises':'Exercises','users.avgMood':'Avg mood',
    'users.avgMood7d':'Avg mood (7d)','users.lastConnexion':'Last login','users.statusLabel':'Status',
    'users.editName':'Name','users.editEmail':'Email','users.grantPremium':'Grant Premium',
    'users.removePremium':'Remove Premium','users.grantAdmin':'Grant Admin','users.removeAdmin':'Remove Admin',
    'users.reactivate':'Reactivate','users.suspend':'Suspend','users.save':'Save','users.delete':'Delete',
    'users.confirmSuspend':'Suspend this user?',
    'users.confirmDelete':'Permanently delete this account? This action is irreversible.',
    'users.updated':'User updated',
    'subscriptions.subtitle':'Subscribers, revenue and expirations',
    'subscriptions.allStatuses':'All statuses','subscriptions.active':'Active',
    'subscriptions.trial':'Trial','subscriptions.canceled':'Canceled','subscriptions.expired':'Expired',
    'subscriptions.allProviders':'All providers','subscriptions.plan':'Plan',
    'subscriptions.status':'Status','subscriptions.type':'Type','subscriptions.provider':'Provider',
    'subscriptions.price':'Price','subscriptions.start':'Start','subscriptions.end':'End',
    'subscriptions.expiringSoon':'Expiring soon (7 days)','subscriptions.noSub':'No subscriptions',
    'subscriptions.noExpiring':'No upcoming expiration',
    'subscriptions.activeLabel':'Active','subscriptions.trialsLabel':'Trials',
    'subscriptions.canceledLabel':'Canceled','subscriptions.mrr':'MRR',
    'subscriptions.thisMonth':'$ this month','subscriptions.expiring7':'Expire < 7d','subscriptions.total':'$ total',
    'subscriptions.view':'View','subscriptions.trialBadge':'Trial',
    'payments.subtitle':'Transactions, revenue and payment statuses',
    'payments.allStatuses':'All statuses','payments.succeeded':'Succeeded','payments.pending':'Pending',
    'payments.failed':'Failed','payments.refunded':'Refunded','payments.canceled':'Canceled',
    'payments.allProviders':'All providers','payments.amount':'Amount','payments.currency':'Currency',
    'payments.status':'Status','payments.provider':'Provider','payments.source':'Source',
    'payments.paymentId':'Payment ID','payments.date':'Date','payments.noPayments':'No payments',
    'payments.totalRevenue':'Total revenue','payments.thisMonth':'This month','payments.succeededCount':'Succeeded',
    'payments.failedCount':'Failed','payments.pendingCount':'Pending',
    'ai.title':'AI monitoring','ai.subtitle':'Real LLM usage, latency and errors',
    'ai.requestsPerDay':'AI requests per day (30d)','ai.modelsUsed':'Models used',
    'ai.model':'Model','ai.requests':'Requests','ai.errors':'Errors','ai.avgLatency':'Avg latency',
    'ai.tokens':'Tokens','ai.recentErrors':'Recent errors','ai.date':'Date',
    'ai.noErrors':'No recent errors','ai.noData':'No data',
    'ai.requestsLabel':'Requests','ai.errorLabel':'Errors','ai.latencyMs':'Latency (ms)',
    'ai.totalRequests':'Requests','ai.ok':'OK','ai.avgLatencyLabel':'Avg latency','ai.tokensLabel':'Tokens',
    'ai.prompt':'prompt','ai.completion':'compl.',
    'notifications.subtitle':'Send push notifications and view history',
    'notifications.newTitle':'New notification','notifications.titleLabel':'Title',
    'notifications.titlePlaceholder':'Notification title','notifications.bodyLabel':'Body',
    'notifications.bodyPlaceholder':'Your message...','notifications.targetLabel':'Target',
    'notifications.targetAll':'All users','notifications.targetPremium':'Premium subscribers',
    'notifications.targetFree':'Free users','notifications.targetSpecific':'Specific user',
    'notifications.userId':'User ID','notifications.userIdPlaceholder':'User ID',
    'notifications.send':'Send','notifications.history':'History',
    'notifications.statusLabel':'Status','notifications.sent':'Sent','notifications.failed':'Failed',
    'notifications.date':'Date','notifications.noNotif':'No notification sent',
    'notifications.sending':'Sending...','notifications.userRequired':'User ID required',
    'notifications.sentCount':'notifications sent',
    'notifications.sentBadge':'Sent','notifications.partialBadge':'Partial','notifications.failedBadge':'Failed',
    'audit.title':'Audit log','audit.subtitle':'Traceability of admin actions',
    'audit.allActions':'All actions','audit.action':'Action','audit.admin':'Admin',
    'audit.target':'Target','audit.details':'Details','audit.result':'Result','audit.date':'Date',
    'audit.noActions':'No action recorded','audit.ok':'OK','audit.err':'Err',
    'system.subtitle':'Infrastructure status and server errors',
    'system.recentErrors':'Recent errors','system.source':'Source','system.route':'Route',
    'system.message':'Message','system.detail':'Detail','system.date':'Date','system.noErrors':'No error recorded',
    'system.database':'Database','system.status':'Status','system.connected':'Connected',
    'system.dbError':'Error','system.errors24h':'Errors (24h)','system.config':'Configuration',
    'system.environment':'Environment','system.llm':'LLM','system.monetization':'Monetization',
    'system.freeSessions':'Free sessions','system.rateLimiting':'Rate limiting',
    'system.encryption':'PII encryption','system.premiumPrice':'Premium price','system.cors':'CORS origins',
    'system.enabled':'Enabled','system.disabled':'Disabled','system.perWeek':'/week',
  },
  ar: {
    'nav.dashboard':'لوحة التحكم','nav.analytics':'التحليلات','nav.users':'المستخدمون',
    'nav.subscriptions':'الاشتراكات','nav.payments':'المدفوعات','nav.ai':'الذكاء الاصطناعي',
    'nav.notifications':'الإشعارات','nav.audit':'التدقيق','nav.system':'النظام',
    'nav.logout':'تسجيل الخروج',
    'prefs.language':'اللغة','prefs.theme':'المظهر','prefs.light':'فاتح','prefs.dark':'داكن',
    'login.welcome':'مرحباً','login.subtitle':'سجّل الدخول إلى لوحة الإدارة',
    'login.email':'البريد الإلكتروني','login.password':'كلمة المرور','login.submit':'تسجيل الدخول',
    'login.error':'خطأ في الاتصال','common.error':'خطأ','common.loading':'جارٍ التحميل...',
    'common.name':'الاسم','common.email':'البريد الإلكتروني','common.user':'المستخدم','common.close':'إغلاق',
    'common.vie':'عرض','common.page':'صفحة','common.defaultError':'فشل التحميل',
    'common.noData':'لا توجد بيانات',
    'dashboard.subtitle':'نظرة عامة على تطبيقك الصحي',
    'dashboard.moodTrend':'اتجاه المزاج (7 أيام)',
    'dashboard.techUsed':'التقنيات المستخدمة (7 أيام)',
    'dashboard.users':'المستخدمون','dashboard.premium':'بريميوم',
    'dashboard.activeSubs':'اشتراكات نشطة','dashboard.paidPayments':'مدفوعات ناجحة',
    'dashboard.sessions7':'الجلسات (7أ)','dashboard.aiRequests7':'طلبات الذكاء (7أ)',
    'dashboard.activeUsers7':'نشطون (7أ)',
    'dashboard.thisWeek':'هذا الأسبوع','dashboard.conversion':'٪ تحويل',
    'dashboard.trials':'تجارب','dashboard.canceled':'ملغاة','dashboard.errors':'أخطاء',
    'dashboard.revenue':'الإيرادات','dashboard.total':'الإجمالي','dashboard.sessions':'جلسات',
    'dashboard.moodAvg':'متوسط المزاج','dashboard.entries':'إدخالات','dashboard.noChartData':'لا توجد بيانات',
    'analytics.subtitle':'النمو والنشاط والإيرادات خلال 30 يوماً',
    'analytics.users':'المستخدمون','analytics.premium':'بريميوم','analytics.premiumRate':'٪ بريميوم','analytics.totalSessions':'الجلسات',
    'analytics.allMessages':'الرسائل','analytics.userGrowth':'نمو المستخدمين (30ي)',
    'analytics.sessions':'الجلسات','analytics.messages':'الرسائل','analytics.revenue':'الإيرادات (30ي)',
    'analytics.activeSubs':'المشتركون النشطون','analytics.aiUsage':'استخدام الذكاء (30ي)',
    'analytics.retention':'الاحتفاظ حسب المجموعة','analytics.cohort':'المجموعة',
    'analytics.new':'جدد','analytics.newUsers':'جدد','analytics.revenueLabel':'الإيرادات ($)',
    'analytics.subscribers':'المشتركون','analytics.cohortDay':'يوم','analytics.na':'غير متوفر',
    'users.subtitle':'إدارة الحسابات والدعم',
    'users.search':'ابحث بالاسم أو البريد الإلكتروني...',
    'users.filterPremium':'حالة بريميوم','users.premium':'بريميوم','users.free':'مجاني',
    'users.filterActivity':'نشاط 7أ','users.active':'نشط','users.inactive':'غير نشط',
    'users.filterSuspended':'التعليق','users.suspended':'موقوفون','users.notSuspended':'غير موقوفين',
    'users.sessions':'الجلسات','users.status':'الحالة','users.activity':'النشاط',
    'users.joined':'الانضمام','users.lastLogin':'آخر دخول',
    'users.noUsers':'لا يوجد مستخدمون','users.admin':'مدير','users.banned':'موقوف',
    'users.premiumBadge':'بريميوم','users.freeBadge':'مجاني','users.activeBadge':'نشط',
    'users.view':'عرض','users.userDetail':'تفاصيل المستخدم',
    'users.techniques':'التقنيات المستخدمة','users.moodsRecent':'آخر الحالات',
    'users.sessionsLabel':'الجلسات','users.joinedOn':'انضم في','users.totalSessions':'إجمالي الجلسات',
    'users.sessions7d':'الجلسات (7أ)','users.totalMessages':'إجمالي الرسائل','users.messages7d':'الرسائل (7أ)',
    'users.moodCount':'الحالات','users.exercises':'التمارين','users.avgMood':'متوسط المزاج',
    'users.avgMood7d':'متوسط المزاج (7أ)','users.lastConnexion':'آخر دخول','users.statusLabel':'الحالة',
    'users.editName':'الاسم','users.editEmail':'البريد الإلكتروني','users.grantPremium':'منح بريميوم',
    'users.removePremium':'إزالة بريميوم','users.grantAdmin':'منح مدير','users.removeAdmin':'إزالة مدير',
    'users.reactivate':'إعادة تفعيل','users.suspend':'تعليق','users.save':'حفظ','users.delete':'حذف',
    'users.confirmSuspend':'تعليق هذا المستخدم؟',
    'users.confirmDelete':'حذف هذا الحساب نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.',
    'users.updated':'تم تحديث المستخدم',
    'subscriptions.subtitle':'المشتركون والإيرادات والانتهاءات',
    'subscriptions.allStatuses':'كل الحالات','subscriptions.active':'نشط',
    'subscriptions.trial':'تجربة','subscriptions.canceled':'ملغى','subscriptions.expired':'منتهي',
    'subscriptions.allProviders':'كل المزودين','subscriptions.plan':'الخطة',
    'subscriptions.status':'الحالة','subscriptions.type':'النوع','subscriptions.provider':'المزود',
    'subscriptions.price':'السعر','subscriptions.start':'البداية','subscriptions.end':'النهاية',
    'subscriptions.expiringSoon':'انتهاء قريب (7 أيام)','subscriptions.noSub':'لا توجد اشتراكات',
    'subscriptions.noExpiring':'لا يوجد انتهاء قريب',
    'subscriptions.activeLabel':'نشطة','subscriptions.trialsLabel':'تجارب',
    'subscriptions.canceledLabel':'ملغاة','subscriptions.mrr':'الإيراد الشهري',
    'subscriptions.thisMonth':'$ هذا الشهر','subscriptions.expiring7':'تنتهي < 7أ','subscriptions.total':'$ الإجمالي',
    'subscriptions.view':'عرض','subscriptions.trialBadge':'تجربة',
    'payments.subtitle':'المعاملات والإيرادات وحالات الدفع',
    'payments.allStatuses':'كل الحالات','payments.succeeded':'ناجح','payments.pending':'قيد الانتظار',
    'payments.failed':'فشل','payments.refunded':'مسترجع','payments.canceled':'ملغى',
    'payments.allProviders':'كل المزودين','payments.amount':'المبلغ','payments.currency':'العملة',
    'payments.status':'الحالة','payments.provider':'المزود','payments.source':'المصدر',
    'payments.paymentId':'معرّف الدفع','payments.date':'التاريخ','payments.noPayments':'لا توجد مدفوعات',
    'payments.totalRevenue':'إجمالي الإيرادات','payments.thisMonth':'هذا الشهر','payments.succeededCount':'ناجحة',
    'payments.failedCount':'فاشلة','payments.pendingCount':'قيد الانتظار',
    'ai.title':'مراقبة الذكاء','ai.subtitle':'الاستخدام الفعلي للذكاء والتأخير والأخطاء',
    'ai.requestsPerDay':'طلبات الذكاء يومياً (30ي)','ai.modelsUsed':'النماذج المستخدمة',
    'ai.model':'النموذج','ai.requests':'الطلبات','ai.errors':'الأخطاء','ai.avgLatency':'متوسط التأخير',
    'ai.tokens':'الرموز','ai.recentErrors':'أخطاء حديثة','ai.date':'التاريخ',
    'ai.noErrors':'لا توجد أخطاء حديثة','ai.noData':'لا توجد بيانات',
    'ai.requestsLabel':'الطلبات','ai.errorLabel':'الأخطاء','ai.latencyMs':'التأخير (مللي ثانية)',
    'ai.totalRequests':'الطلبات','ai.ok':'ناجح','ai.avgLatencyLabel':'متوسط التأخير','ai.tokensLabel':'الرموز',
    'ai.prompt':'مطلب','ai.completion':'إكمال',
    'notifications.subtitle':'إرسال إشعارات وعرض السجل',
    'notifications.newTitle':'إشعار جديد','notifications.titleLabel':'العنوان',
    'notifications.titlePlaceholder':'عنوان الإشعار','notifications.bodyLabel':'المحتوى',
    'notifications.bodyPlaceholder':'رسالتك...','notifications.targetLabel':'الهدف',
    'notifications.targetAll':'كل المستخدمين','notifications.targetPremium':'مشتركو بريميوم',
    'notifications.targetFree':'المستخدمون المجانيون','notifications.targetSpecific':'مستخدم محدد',
    'notifications.userId':'معرّف المستخدم','notifications.userIdPlaceholder':'معرّف المستخدم',
    'notifications.send':'إرسال','notifications.history':'السجل',
    'notifications.statusLabel':'الحالة','notifications.sent':'مرسل','notifications.failed':'فاشل',
    'notifications.date':'التاريخ','notifications.noNotif':'لا يوجد إشعار مرسل',
    'notifications.sending':'جارٍ الإرسال...','notifications.userRequired':'معرّف المستخدم مطلوب',
    'notifications.sentCount':'إشعار تم إرسالها',
    'notifications.sentBadge':'مرسل','notifications.partialBadge':'جزئي','notifications.failedBadge':'فشل',
    'audit.title':'سجل التدقيق','audit.subtitle':'أثر إجراءات المسؤولين',
    'audit.allActions':'كل الإجراءات','audit.action':'الإجراء','audit.admin':'المسؤول',
    'audit.target':'الهدف','audit.details':'التفاصيل','audit.result':'النتيجة','audit.date':'التاريخ',
    'audit.noActions':'لا يوجد إجراء مسجل','audit.ok':'ناجح','audit.err':'خطأ',
    'system.subtitle':'حالة البنية التحتية وأخطاء الخادم',
    'system.recentErrors':'أخطاء حديثة','system.source':'المصدر','system.route':'المسار',
    'system.message':'الرسالة','system.detail':'التفاصيل','system.date':'التاريخ','system.noErrors':'لا يوجد خطأ مسجل',
    'system.database':'قاعدة البيانات','system.status':'الحالة','system.connected':'متصل',
    'system.dbError':'خطأ','system.errors24h':'أخطاء (24س)','system.config':'الإعدادات',
    'system.environment':'البيئة','system.llm':'نموذج اللغة','system.monetization':'التمويل',
    'system.freeSessions':'الجلسات المجانية','system.rateLimiting':'معدل الحد',
    'system.encryption':'تشفير البيانات','system.premiumPrice':'سعر بريميوم','system.cors':'أصول CORS',
    'system.enabled':'مفعّل','system.disabled':'معطّل','system.perWeek':'/أسبوع',
  }
};

let currentLang = localStorage.getItem('serene_lang') || 'fr';
document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

function t(key){
  if(key==null) return '';
  const table = TRANSLATIONS[currentLang] || TRANSLATIONS.fr;
  if(table[key] != null) return table[key];
  if(TRANSLATIONS.fr[key] != null) return TRANSLATIONS.fr[key];
  return '[missing: '+key+']';
}

/* ═════════════════════ Theme ═════════════════════ */
let currentTheme = localStorage.getItem('serene_theme') || 'light';
function applyTheme(){
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.getElementById('theme-label').textContent =
    currentTheme === 'dark' ? t('prefs.dark') : t('prefs.light');
  document.getElementById('theme-label-top').textContent =
    currentTheme === 'dark' ? t('prefs.dark') : t('prefs.light');
  const dark = currentTheme === 'dark';
  document.getElementById('theme-icon-light').style.display = dark ? 'none' : 'block';
  document.getElementById('theme-icon-dark').style.display = dark ? 'block' : 'none';
  document.getElementById('theme-icon-light-top').style.display = dark ? 'none' : 'block';
  document.getElementById('theme-icon-dark-top').style.display = dark ? 'block' : 'none';
  refreshCurrentTab(true);
}
function toggleTheme(){
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('serene_theme', currentTheme);
  applyTheme();
}

/* Chart colors adapt to theme */
function getColors(){
  const dark = currentTheme === 'dark';
  return {
    primary:'#6fd3a5', primaryFixed:'#1f4a38', secondary:'#a9c79a',
    secondaryContainer:'#3d5040', outline:'#93a39b', surface: dark ? 'rgba(0,0,0,0)' : '#e8fff1',
    onSurface:'#e6f5ec', onSurfaceV:'#c2cfc7', success:'#35c76a',
    warning:'#e08a3c', error:'#ff8080', info:'#5fb8e8'
  };
}
function setChartC(){
  window.__C = getColors();
}

/* ═════════════════════ Translations of static DOM ═════════════════════ */
function applyTranslations(){
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  const sel = document.getElementById('lang-select');
  const selt = document.getElementById('lang-select-top');
  if(sel) sel.value = currentLang;
  if(selt) selt.value = currentLang;
  applyTheme();
}

function setLang(lang){
  if(!TRANSLATIONS[lang]) return;
  currentLang = lang;
  localStorage.setItem('serene_lang', currentLang);
  applyTranslations();
}

document.getElementById('lang-select').addEventListener('change',e=>setLang(e.target.value));
document.getElementById('lang-select-top').addEventListener('change',e=>setLang(e.target.value));
document.getElementById('theme-toggle').addEventListener('click',toggleTheme);
document.getElementById('theme-toggle-top').addEventListener('click',toggleTheme);

/* Cache of last fetched data per tab so language/theme changes can re-render
   the current tab without issuing new API requests. */
const dataCache = {};
const pendingRefresh = {};

function refreshCurrentTab(themeOnly){
  if(themeOnly || !TABS.includes(activeTab)) setChartC();
  if(activeTab==='dashboard'){ if(dataCache.dashboard) renderDashboard(dataCache.dashboard); }
  else if(activeTab==='analytics'){ if(dataCache.analytics) renderAnalytics(dataCache.analytics); }
  else if(activeTab==='users'){ if(dataCache.users) renderUsers(dataCache.users); }
  else if(activeTab==='subscriptions'){ if(dataCache.subscriptions) renderSubscriptions(dataCache.subscriptions); }
  else if(activeTab==='payments'){ if(dataCache.payments) renderPayments(dataCache.payments); }
  else if(activeTab==='ai'){ if(dataCache.ai) renderAI(dataCache.ai); }
  else if(activeTab==='notifications'){ if(dataCache.notifications) renderNotifications(dataCache.notifications); }
  else if(activeTab==='audit'){ if(dataCache.audit) renderAudit(dataCache.audit); }
  else if(activeTab==='system'){ if(dataCache.system) renderSystem(dataCache.system); if(dataCache.errors) renderErrorLogs(dataCache.errors); }
}

/* ═════════════════════ helpers ═════════════════════ */
function authHeaders(){return{'Authorization':'Bearer '+token,'Content-Type':'application/json'}}
async function apiFetch(path,opts={}){
  const r = await fetch(API+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});
  if(r.status===401){logout();throw new Error('Unauthorized')}
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||t('common.error'))}
  return r.json();
}
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
function localeCode(){return currentLang==='ar'?'ar-TN':currentLang==='en'?'en-GB':'fr-FR'}
function fmtDate(s){return s?new Date(s).toLocaleDateString(localeCode()):'-'}
function fmtDateTime(s){return s?new Date(s).toLocaleString(localeCode(),{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'}

/* ── Lightweight caching to avoid repeated fetches on navigation ── */
const CACHE_TTL = 30000; // ms
const apiCache = {};
async function fetchCached(path, ttl){
  ttl = ttl || CACHE_TTL;
  const now = Date.now();
  const hit = apiCache[path];
  if(hit && (now - hit.ts) < ttl) return hit.data;
  const data = await apiFetch(path);
  apiCache[path] = { ts:now, data };
  return data;
}
function invalidateCache(path){ delete apiCache[path]; }

/* ── Dashboard card navigation helpers ── */
function goToUsers(premium, active){
  const selPremium = document.getElementById('user-filter-premium');
  const selActive = document.getElementById('user-filter-active');
  if(premium != null) selPremium.value = premium ? 'true' : '';
  if(active != null) selActive.value = active ? 'true' : '';
  switchTab('users');
}
function goToPayments(status, provider){
  const selStatus = document.getElementById('payments-filter-status');
  const selProvider = document.getElementById('payments-filter-provider');
  if(status != null){ selStatus.value = status; paymentStatusFilter = status; }
  if(provider != null){ selProvider.value = provider; paymentProviderFilter = provider; }
  switchTab('payments');
}
function goToSubscriptions(status, provider){
  const selStatus = document.getElementById('subs-filter');
  const selProvider = document.getElementById('subs-filter-provider');
  if(status != null){ selStatus.value = status; subStatus = status; }
  if(provider != null){ selProvider.value = provider; subProvider = provider; }
  switchTab('subscriptions');
}

/* ── Login ── */
document.getElementById('login-form').onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  try {
    const r = await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d = await r.json();
    if(!r.ok){errEl.textContent=d.detail||t('common.error');return}
    token=d.access_token;localStorage.setItem('admin_token',token);showApp();
  } catch(err){errEl.textContent=t('login.error')}
};

function logout(){
  localStorage.removeItem('admin_token');token=null;
  for(const k in apiCache)delete apiCache[k];
  document.getElementById('app').style.display='none';
  document.getElementById('login-view').style.display='flex';
}
function showApp(){
  document.getElementById('login-view').style.display='none';
  document.getElementById('app').style.display='block';
  switchTab('dashboard');
}

/* ── Mobile menu ── */
function closeMenu(){
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
}
(function(){
  var btn=document.getElementById('menu-btn');
  var scrim=document.getElementById('scrim');
  if(btn)btn.addEventListener('click',function(){
    document.querySelector('.sidebar').classList.toggle('open');
    scrim.classList.toggle('show');
  });
  if(scrim)scrim.addEventListener('click',closeMenu);
})();

/* ── Navigation ── */
const TABS = ['dashboard','analytics','users','subscriptions','payments','ai','notifications','audit','system'];
document.querySelectorAll('.sidebar nav a').forEach(a=>{
  a.addEventListener('click',e=>{e.preventDefault();switchTab(a.dataset.tab)});
});
function switchTab(name){
  activeTab = name;
  closeMenu();
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.tab===name));
  TABS.forEach(p=>{document.getElementById('page-'+p).style.display=p===name?'block':'none'});
  if(name==='dashboard')loadDashboard();
  if(name==='analytics')loadAnalytics();
  if(name==='users'){currentPage=1;loadUsers()}
  if(name==='subscriptions')loadSubscriptions();
  if(name==='payments')loadPayments();
  if(name==='ai')loadAI();
  if(name==='notifications'){loadNotifications();}
  if(name==='audit')loadAudit();
  if(name==='system')loadSystem();
}

/* ═════════════════════ Dashboard ═════════════════════ */
async function loadDashboard(){
  setChartC();
  const cards=document.getElementById('stats-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await fetchCached('/admin/stats');
    dataCache.dashboard=s;
    renderDashboard(s);
  }catch(e){cards.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderDashboard(s){
  const cards=document.getElementById('stats-cards');
  const totals=s.totals,w=s.week;
  const rv=s.revenue||{},py=s.payments||{},sb=s.subscriptions||{};
  const revenue=rv.total?fmtNum(rv.total)+'$ CA':'-';
  cards.innerHTML=`
    <div class="stat-card clickable" onclick="goToUsers()"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><div class="info"><div class="value">${totals.users}</div><div class="label">${esc(t('dashboard.users'))}</div><div class="sub">+${w.new_users} ${esc(t('dashboard.thisWeek'))}</div></div></div>
    <div class="stat-card clickable" onclick="goToUsers(true)"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div><div class="info"><div class="value">${totals.premium_users}</div><div class="label">${esc(t('dashboard.premium'))}</div><div class="sub">${w.conversion_rate}${esc(t('dashboard.conversion'))}</div></div></div>
    <div class="stat-card clickable" onclick="goToSubscriptions()"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">${sb.active||0}</div><div class="label">${esc(t('dashboard.activeSubs'))}</div><div class="sub">${sb.trials||0} ${esc(t('dashboard.trials'))}, ${sb.canceled||0} ${esc(t('dashboard.canceled'))}</div></div></div>
    <div class="stat-card clickable" onclick="goToPayments('succeeded')"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg></div><div class="info"><div class="value">${py.succeeded||0}</div><div class="label">${esc(t('dashboard.paidPayments'))}</div><div class="sub">${revenue} ${esc(t('dashboard.revenue'))}</div></div></div>
    <div class="stat-card clickable" onclick="switchTab('analytics')"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div><div class="info"><div class="value">${w.sessions}</div><div class="label">${esc(t('dashboard.sessions7'))}</div><div class="sub">${totals.sessions} ${esc(t('dashboard.total'))}</div></div></div>
    <div class="stat-card clickable" onclick="switchTab('ai')"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">${s.ai.requests_7d||0}</div><div class="label">${esc(t('dashboard.aiRequests7'))}</div><div class="sub">${s.ai.errors_7d||0} ${esc(t('dashboard.errors'))}</div></div></div>
    <div class="stat-card clickable" onclick="switchTab('analytics')"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">${w.active_users}</div><div class="label">${esc(t('dashboard.activeUsers7'))}</div><div class="sub">${w.sessions} ${esc(t('dashboard.sessions'))}</div></div></div>
  `;
  renderMoodChart(s.mood_trend);
  renderTechChart(s.techniques);
}
function renderMoodChart(data){
  if(charts.mood)charts.mood.destroy();
  const cc=getColors();
  const ctx=document.getElementById('chart-mood');
  if(!data.length){ctx.parentElement.innerHTML='<h3>'+esc(t('dashboard.moodTrend'))+'</h3><div class="empty"><p>'+esc(t('dashboard.noChartData'))+'</p></div>';return}
  charts.mood=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:[
      {label:esc(t('dashboard.moodAvg')),data:data.map(d=>d.avg),borderColor:cc.primary,backgroundColor:cc.primaryFixed+'55',fill:true,tension:.4,pointRadius:5,pointBackgroundColor:cc.primary,pointBorderColor:'#fff',pointBorderWidth:2},
      {label:esc(t('dashboard.entries')),data:data.map(d=>d.count),borderColor:cc.secondary,backgroundColor:'transparent',tension:.4,pointRadius:3,borderDash:[6,4],yAxisID:'y1',pointBackgroundColor:cc.secondary}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:cc.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12}}},tooltip:{rtl:currentLang==='ar',textDirection:currentLang==='ar'?'rtl':'ltr'}},scales:{x:{ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}},y:{min:0,max:10,ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}},y1:{position:'right',min:0,ticks:{color:cc.outline,font:{size:11}},grid:{display:false}}}}
  });
}
function renderTechChart(data){
  if(charts.tech)charts.tech.destroy();
  const cc=getColors();
  const ctx=document.getElementById('chart-tech');
  const labels=Object.keys(data);
  if(!labels.length){ctx.parentElement.innerHTML='<h3>'+esc(t('dashboard.techUsed'))+'</h3><div class="empty"><p>'+esc(t('dashboard.noChartData'))+'</p></div>';return}
  const palette=[cc.primary,cc.secondary,cc.success,cc.warning,cc.info];
  charts.tech=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:labels.map(l=>data[l]),backgroundColor:palette.slice(0,labels.length),borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{color:cc.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12},padding:14},rtl:currentLang==='ar',textDirection:currentLang==='ar'?'rtl':'ltr'}}}
  });
}

/* ═════════════════════ Analytics ═════════════════════ */
async function loadAnalytics(){
  setChartC();
  const el=document.getElementById('analytics-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await fetchCached('/admin/analytics?days=30');
    dataCache.analytics=d;
    renderAnalytics(d);
  }catch(e){el.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderAnalytics(d){
  const el=document.getElementById('analytics-content');
  const o=d.overview,s=d.series,r=d.retention;
  el.innerHTML=
    '<div class="stats-grid">'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><div class="info"><div class="value">'+o.total_users+'</div><div class="label">'+esc(t('analytics.users'))+'</div><div class="sub">'+o.conversion_rate+esc(t('analytics.premiumRate'))+'</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div><div class="info"><div class="value">'+o.premium_users+'</div><div class="label">'+esc(t('analytics.premium'))+'</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div><div class="info"><div class="value">'+o.total_sessions+'</div><div class="label">'+esc(t('analytics.totalSessions'))+'</div></div></div>'+
      '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">'+o.total_messages+'</div><div class="label">'+esc(t('analytics.allMessages'))+'</div></div></div>'+
    '</div>'+
    '<div class="charts-row"><div class="chart-card wide"><h3>'+esc(t('analytics.userGrowth'))+'</h3><canvas id="chart-growth"></canvas></div></div>'+
    '<div class="charts-row">'+
      '<div class="chart-card"><h3>'+esc(t('analytics.sessions'))+'</h3><canvas id="chart-sessions"></canvas></div>'+
      '<div class="chart-card"><h3>'+esc(t('analytics.messages'))+'</h3><canvas id="chart-messages"></canvas></div>'+
    '</div>'+
    '<div class="charts-row">'+
      '<div class="chart-card"><h3>'+esc(t('analytics.revenue'))+'</h3><canvas id="chart-revenue"></canvas></div>'+
      '<div class="chart-card"><h3>'+esc(t('analytics.activeSubs'))+'</h3><canvas id="chart-premium"></canvas></div>'+
    '</div>'+
    '<div class="charts-row">'+
      '<div class="chart-card wide"><h3>'+esc(t('analytics.aiUsage'))+'</h3><canvas id="chart-ai"></canvas></div>'+
    '</div>'+
    '<div class="sys-grid"><div class="sys-card"><h3>'+esc(t('analytics.retention'))+'</h3>'+
    ['d1','d7','d14','d30'].map(k=>'<div class="sys-row"><span class="key">'+esc(t('analytics.cohort'))+' '+esc(t('analytics.cohortDay'))+k.slice(1)+'</span><span class="val">'+(r[k]==null?esc(t('analytics.na')):r[k]+'%')+'</span></div>').join('')+
    '</div></div>';
  renderLine('chart-growth',s.growth,['new'],[t('analytics.newUsers')],'#16a34a');
  renderLine('chart-sessions',s.sessions,['count'],[t('analytics.sessions')],getColors().primary);
  renderLine('chart-messages',s.messages,['count'],[t('analytics.messages')],getColors().secondary);
  renderLine('chart-revenue',s.revenue,['amount'],[t('analytics.revenueLabel')],getColors().warning);
  renderLine('chart-premium',s.premium,['total'],[t('analytics.subscribers')],getColors().info);
  renderAIChart(s.ai);
}
function renderLine(canvasId,data,fields,labels,color){
  if(charts[canvasId])charts[canvasId].destroy();
  const ctx=document.getElementById(canvasId);
  const cc=getColors();
  charts[canvasId]=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:fields.map((f,i)=>({label:labels[i],data:data.map(d=>d[f]),borderColor:color,backgroundColor:color+'22',fill:true,tension:.35,pointRadius:3}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:cc.onSurfaceV,font:{size:12}}},tooltip:{rtl:currentLang==='ar',textDirection:currentLang==='ar'?'rtl':'ltr'}},scales:{x:{ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}},y:{ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}}}}
  });
}
function renderAIChart(data){
  if(charts['chart-ai'])charts['chart-ai'].destroy();
  const cc=getColors();
  const ctx=document.getElementById('chart-ai');
  charts['chart-ai']=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:[
      {label:esc(t('ai.requestsLabel')),data:data.map(d=>d.requests),borderColor:cc.primary,backgroundColor:cc.primaryFixed+'55',fill:true,tension:.35,pointRadius:3},
      {label:esc(t('ai.errorLabel')),data:data.map(d=>d.errors),borderColor:cc.error,backgroundColor:'transparent',tension:.35,pointRadius:3,borderDash:[6,4]},
      {label:esc(t('ai.latencyMs')),data:data.map(d=>d.avg_latency),borderColor:cc.warning,backgroundColor:'transparent',tension:.35,pointRadius:3,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:cc.onSurfaceV,font:{size:12}}},tooltip:{rtl:currentLang==='ar',textDirection:currentLang==='ar'?'rtl':'ltr'}},scales:{x:{ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}},y:{ticks:{color:cc.outline,font:{size:11}},grid:{color:cc.surface}},y1:{position:'right',ticks:{color:cc.outline,font:{size:11}},grid:{display:false}}}}
  });
}

/* ═════════════════════ Users ═════════════════════ */
document.getElementById('user-search').addEventListener('input',e=>{
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{currentPage=1;loadUsers()},300);
});
['user-filter-premium','user-filter-active','user-filter-suspended'].forEach(id=>{
  document.getElementById(id).addEventListener('change',()=>{currentPage=1;loadUsers()});
});
function usersQuery(){
  const q=document.getElementById('user-search').value;
  const premium=document.getElementById('user-filter-premium').value;
  const active=document.getElementById('user-filter-active').value;
  const suspended=document.getElementById('user-filter-suspended').value;
  let url='/admin/users?page='+currentPage+'&per_page=20';
  if(q)url+='&q='+encodeURIComponent(q);
  if(premium)url+='&premium='+premium;
  if(active)url+='&active='+active;
  if(suspended)url+='&suspended='+suspended;
  return url;
}
async function loadUsers(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('users-tbody');
  tbody.innerHTML='<tr><td colspan="8" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch(usersQuery());
    dataCache.users=d;
    renderUsers(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="8" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderUsers(d){
  const tbody=document.getElementById('users-tbody');
  if(!d.users.length){tbody.innerHTML='<tr><td colspan="8" class="empty"><p>'+esc(t('users.noUsers'))+'</p></td></tr>';return}
  tbody.innerHTML=d.users.map(u=>'<tr>'+
    '<td style="font-weight:600">'+esc(u.name)+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(u.email)+'</td>'+
    '<td>'+u.session_count+'</td>'+
    '<td>'+(u.is_premium?'<span class="badge badge-premium">'+esc(t('users.premiumBadge'))+'</span>':'<span class="badge badge-free">'+esc(t('users.freeBadge'))+'</span>')+(u.is_admin?' <span class="badge badge-admin">'+esc(t('users.admin'))+'</span>':'')+'</td>'+
    '<td>'+(u.is_suspended?'<span class="badge badge-error">'+esc(t('users.banned'))+'</span>':(u.is_active_7d?'<span class="badge badge-active">'+esc(t('users.activeBadge'))+'</span>':'<span class="badge badge-inactive">'+esc(t('users.inactive'))+'</span>'))+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDate(u.created_at)+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+(u.last_login_at?fmtDate(u.last_login_at):'-')+'</td>'+
    '<td><button class="btn btn-outline btn-sm" onclick="openUser('+u.id+')">'+esc(t('users.view'))+'</button></td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'users-pagination','loadUsers');
}
function renderPagination(page,pages,total,elId,fn){
  document.getElementById(elId).innerHTML=
    '<button '+(page<=1?'disabled':'')+' onclick="'+fn+'('+(page-1)+')">&larr;</button>'+
    '<span class="page-info">'+esc(t('common.page'))+' '+page+' / '+pages+' ('+total+')</span>'+
    '<button '+(page>=pages?'disabled':'')+' onclick="'+fn+'('+(page+1)+')">&rarr;</button>';
}

/* ── User Detail Modal ── */
async function openUser(id){
  const modal=document.getElementById('user-modal');
  const body=document.getElementById('modal-body');
  modal.classList.add('open');
  body.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/users/'+id);
    const u=d.user,m=d.metrics;
    document.getElementById('modal-title').textContent=u.name||u.email;
    let techHtml='';
    if(m.techniques&&Object.keys(m.techniques).length){
      techHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">'+esc(t('users.techniques'))+'</label><div style="display:flex;gap:8px;flex-wrap:wrap">'+Object.entries(m.techniques).map(([k,v])=>'<span class="badge badge-premium">'+esc(k)+': '+v+'</span>').join('')+'</div></div>';
    }
    let moodHtml='';
    if(d.mood_logs.length){
      moodHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">'+esc(t('users.moodsRecent'))+'</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+d.mood_logs.slice(0,20).map(mo=>{
        const bg=mo.score>=7?'background:var(--success-bg);color:var(--success)':mo.score>=4?'background:var(--warning-bg);color:var(--warning)':'background:var(--error-container);color:var(--on-error-container)';
        return '<span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--r-full);font-size:12px;font-weight:700;'+bg+'" title="'+esc(mo.label)+'">'+mo.score+'</span>';
      }).join('')+'</div></div>';
    }
    let sessionsHtml='';
    if(d.sessions.length){
      sessionsHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">'+esc(t('users.sessionsLabel'))+' ('+d.sessions.length+')</label><div style="max-height:200px;overflow-y:auto">'+d.sessions.slice(0,10).map(s=>'<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--surface-ch);font-size:14px"><span style="font-weight:500">'+esc(s.title)+'</span><span style="color:var(--outline)">'+fmtDate(s.created_at)+'</span></div>').join('')+'</div></div>';
    }
    body.innerHTML=
      '<div class="detail-grid">'+
        '<div class="detail-item"><label>'+esc(t('common.email'))+'</label><div class="val">'+esc(u.email)+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.joinedOn'))+'</label><div class="val">'+fmtDate(u.created_at)+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.totalSessions'))+'</label><div class="val">'+m.total_sessions+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.sessions7d'))+'</label><div class="val">'+m.sessions_7d+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.totalMessages'))+'</label><div class="val">'+m.total_messages+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.messages7d'))+'</label><div class="val">'+m.messages_7d+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.moodCount'))+'</label><div class="val">'+m.total_mood_logs+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.exercises'))+'</label><div class="val">'+m.total_exercises+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.avgMood'))+'</label><div class="val">'+(m.avg_mood?m.avg_mood+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.avgMood7d'))+'</label><div class="val">'+(m.avg_mood_7d?m.avg_mood_7d+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.statusLabel'))+'</label><div class="val">'+(u.is_premium?'<span class="badge badge-premium">'+esc(t('users.premiumBadge'))+'</span>':'<span class="badge badge-free">'+esc(t('users.freeBadge'))+'</span>')+(u.is_suspended?' <span class="badge badge-error">'+esc(t('users.banned'))+'</span>':'')+'</div></div>'+
        '<div class="detail-item"><label>'+esc(t('users.lastConnexion'))+'</label><div class="val">'+fmtDateTime(u.last_login_at)+'</div></div>'+
      '</div>'+
      '<div class="detail-edit"><div class="form-group"><label>'+esc(t('users.editName'))+'</label><input type="text" id="edit-name" value="'+esc(u.name)+'"></div><div class="form-group"><label>'+esc(t('users.editEmail'))+'</label><input type="email" id="edit-email" value="'+esc(u.email)+'"></div></div>'+
      '<div class="detail-actions">'+
        '<button class="btn btn-success btn-sm" onclick="togglePremium('+u.id+')">'+(u.is_premium?esc(t('users.removePremium')):esc(t('users.grantPremium')))+'</button>'+
        '<button class="btn btn-outline btn-sm" onclick="toggleAdmin('+u.id+')">'+(u.is_admin?esc(t('users.removeAdmin')):esc(t('users.grantAdmin')))+'</button>'+
        (u.is_suspended
          ?'<button class="btn btn-success btn-sm" onclick="reactivateUser('+u.id+')">'+esc(t('users.reactivate'))+'</button>'
          :'<button class="btn btn-danger btn-sm" onclick="suspendUser('+u.id+')">'+esc(t('users.suspend'))+'</button>')+
        '<button class="btn btn-tonal btn-sm" onclick="saveUser('+u.id+')">'+esc(t('users.save'))+'</button>'+
        '<button class="btn btn-danger btn-sm" onclick="deleteUser('+u.id+')">'+esc(t('users.delete'))+'</button>'+
      '</div>'+
      '<div id="modal-msg"></div>'+
      techHtml+moodHtml+sessionsHtml;
  }catch(e){body.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function closeModal(){document.getElementById('user-modal').classList.remove('open')}
document.getElementById('user-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function modalMsg(text,err){
  document.getElementById('modal-msg').innerHTML='<p class="msg '+(err?'err':'')+'">'+esc(text)+'</p>';
}
async function togglePremium(id){await apiFetch('/admin/users/'+id+'/toggle-premium',{method:'PUT'});invalidateCache('/admin/stats');invalidateCache('/admin/analytics?days=30');openUser(id)}
async function toggleAdmin(id){await apiFetch('/admin/users/'+id+'/toggle-admin',{method:'PUT'});openUser(id)}
async function suspendUser(id){
  if(!confirm(t('users.confirmSuspend')))return;
  await apiFetch('/admin/users/'+id+'/suspend',{method:'PUT'});invalidateCache('/admin/stats');openUser(id);loadUsers();
}
async function reactivateUser(id){await apiFetch('/admin/users/'+id+'/reactivate',{method:'PUT'});invalidateCache('/admin/stats');openUser(id);loadUsers()}
async function deleteUser(id){
  if(!confirm(t('users.confirmDelete')))return;
  try{await apiFetch('/admin/users/'+id,{method:'DELETE'});invalidateCache('/admin/stats');closeModal();loadUsers()}
  catch(e){modalMsg(e.message,true)}
}
async function saveUser(id){
  const payload={name:document.getElementById('edit-name').value,email:document.getElementById('edit-email').value};
  try{await apiFetch('/admin/users/'+id,{method:'PUT',body:JSON.stringify(payload)});modalMsg(t('users.updated'));openUser(id)}
  catch(e){modalMsg(e.message,true)}
}

/* ═════════════════════ Subscriptions ═════════════════════ */
let subStatus='';
let subProvider='';
let paymentStatusFilter='';
let paymentProviderFilter='';
async function loadSubscriptions(){
  setChartC();
  const cards=document.getElementById('subs-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const o=await apiFetch('/admin/subscriptions/overview');
    const d=await apiFetch('/admin/subscriptions?status='+subStatus+'&page='+(dataCache.subPage||1)+'&per_page=20'+(subProvider?'&provider='+subProvider:''));
    dataCache.subscriptions={overview:o,table:d};
    renderSubscriptions(dataCache.subscriptions);
  }catch(e){cards.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderSubscriptions(data){
  const o=data.overview;
  const cards=document.getElementById('subs-cards');
  cards.innerHTML=
    '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.active+'</div><div class="label">'+esc(t('subscriptions.activeLabel'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg></div><div class="info"><div class="value">'+o.trials+'</div><div class="label">'+esc(t('subscriptions.trialsLabel'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.canceled+'</div><div class="label">'+esc(t('subscriptions.canceledLabel'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">'+o.mrr+'$</div><div class="label">'+esc(t('subscriptions.mrr'))+'</div><div class="sub">'+o.revenue_month+esc(t('subscriptions.thisMonth'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.expiring_7d+'</div><div class="label">'+esc(t('subscriptions.expiring7'))+'</div><div class="sub">'+o.revenue_total+esc(t('subscriptions.total'))+'</div></div></div>'+
  '</div>';
  renderExpiring(o.expiring);
  renderSubsTable(data.table);
}
function renderExpiring(list){
  const tbody=document.getElementById('expiring-tbody');
  if(!list.length){tbody.innerHTML='<tr><td colspan="6" class="empty"><p>'+esc(t('subscriptions.noExpiring'))+'</p></td></tr>';return}
  tbody.innerHTML=list.map(s=>'<tr>'+
    '<td style="font-weight:600">'+esc(s.name||s.email||'-')+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(s.email||'-')+'</td>'+
    '<td><span class="badge badge-premium">'+esc(s.plan)+'</span></td>'+
    '<td>'+esc(s.price)+'$</td>'+
    '<td style="color:var(--warning);font-weight:600">'+fmtDate(s.period_end)+'</td>'+
    '<td><button class="btn btn-outline btn-sm" onclick="openUser('+s.user_id+')">'+esc(t('subscriptions.view'))+'</button></td>'+
  '</tr>').join('');
}
async function loadSubsTable(page){
  if(page)currentPage=page;
  dataCache.subPage=currentPage;
  const tbody=document.getElementById('subs-tbody');
  tbody.innerHTML='<tr><td colspan="10" class="loading"><div class="spinner"></div></td></tr>';
  try{
    let url='/admin/subscriptions?status='+subStatus+'&page='+currentPage+'&per_page=20';
    if(subProvider)url+='&provider='+subProvider;
    const d=await apiFetch(url);
    if(dataCache.subscriptions)dataCache.subscriptions.table=d;
    renderSubsTable(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="10" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderSubsTable(d){
  const tbody=document.getElementById('subs-tbody');
  if(!d.subscriptions.length){tbody.innerHTML='<tr><td colspan="10" class="empty"><p>'+esc(t('subscriptions.noSub'))+'</p></td></tr>';return}
  tbody.innerHTML=d.subscriptions.map(s=>'<tr>'+
    '<td style="font-weight:600">'+esc(s.name||s.email||'-')+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(s.email||'-')+'</td>'+
    '<td><span class="badge badge-premium">'+esc(s.plan)+'</span></td>'+
    '<td>'+esc(subStatusLabel(s.status))+'</td>'+
    '<td>'+(s.is_trial?'<span class="badge badge-inactive">'+esc(t('subscriptions.trialBadge'))+'</span>':'')+'</td>'+
    '<td>'+providerBadge(s.provider)+'</td>'+
    '<td>'+esc(s.price)+'$</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDate(s.started_at)+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDate(s.period_end)+'</td>'+
    '<td><button class="btn btn-outline btn-sm" onclick="openUser('+s.user_id+')">'+esc(t('subscriptions.view'))+'</button></td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'subs-pagination','loadSubsTable');
}
function providerBadge(p){
  if(p==='stripe')return '<span class="badge badge-stripe">Stripe</span>';
  if(p==='revenuecat')return '<span class="badge badge-revenuecat">RevenueCat</span>';
  if(p==='admin')return '<span class="badge badge-admin">'+esc(t('users.admin'))+'</span>';
  return '<span class="badge badge-inactive">'+(p||'-')+'</span>';
}
function paymentStatusLabel(s){
  if(s==='succeeded')return t('payments.succeeded');
  if(s==='pending')return t('payments.pending');
  if(s==='failed')return t('payments.failed');
  if(s==='refunded')return t('payments.refunded');
  if(s==='canceled'||s==='cancelled')return t('payments.canceled');
  return s||'-';
}
function subStatusLabel(s){
  if(s==='active')return t('subscriptions.active');
  if(s==='trial')return t('subscriptions.trial');
  if(s==='canceled'||s==='cancelled')return t('subscriptions.canceled');
  if(s==='expired')return t('subscriptions.expired');
  return s||'-';
}
function notifTargetLabel(tp){
  if(tp==='all')return t('notifications.targetAll');
  if(tp==='premium')return t('notifications.targetPremium');
  if(tp==='free')return t('notifications.targetFree');
  if(tp==='specific')return t('notifications.targetSpecific');
  return tp||'-';
}
function fmtNum(n){
  if(n==null)return '0';
  return Number(n).toLocaleString(localeCode());
}
document.getElementById('subs-filter').addEventListener('change',e=>{subStatus=e.target.value;currentPage=1;loadSubsTable()});
document.getElementById('subs-filter-provider').addEventListener('change',e=>{subProvider=e.target.value;currentPage=1;loadSubsTable()});

/* ═════════════════════ Payments ═════════════════════ */
async function loadPayments(page){
  if(page)currentPage=page;
  const cards=document.getElementById('payments-cards');
  const tbody=document.getElementById('payments-tbody');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  tbody.innerHTML='<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const o=await apiFetch('/admin/payments/overview');
    const d=await apiFetch('/admin/payments?page='+currentPage+'&per_page=20'+(paymentStatusFilter?'&status='+paymentStatusFilter:'')+(paymentProviderFilter?'&provider='+paymentProviderFilter:''));
    dataCache.payments={overview:o,table:d};
    renderPayments(dataCache.payments);
  }catch(e){cards.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderPayments(data){
  const o=data.overview;
  const cards=document.getElementById('payments-cards');
  cards.innerHTML=
    '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">'+o.total_revenue+'$</div><div class="label">'+esc(t('payments.totalRevenue'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#0369a1;opacity:.12"><svg viewBox="0 0 24 24" fill="#0369a1"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">'+o.month_revenue+'$</div><div class="label">'+esc(t('payments.thisMonth'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#16a34a;opacity:.12"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.succeeded_count+'</div><div class="label">'+esc(t('payments.succeededCount'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.failed_count+'</div><div class="label">'+esc(t('payments.failedCount'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="info"><div class="value">'+o.pending_count+'</div><div class="label">'+esc(t('payments.pendingCount'))+'</div></div></div>'+
  '</div>';
  renderPaymentsTable(data.table);
}
async function loadPaymentsTable(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('payments-tbody');
  try{
    let url='/admin/payments?page='+currentPage+'&per_page=20';
    if(paymentStatusFilter)url+='&status='+paymentStatusFilter;
    if(paymentProviderFilter)url+='&provider='+paymentProviderFilter;
    const d=await apiFetch(url);
    if(dataCache.payments)dataCache.payments.table=d;
    renderPaymentsTable(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="9" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderPaymentsTable(d){
  const tbody=document.getElementById('payments-tbody');
  if(!d.payments.length){tbody.innerHTML='<tr><td colspan="9" class="empty"><p>'+esc(t('payments.noPayments'))+'</p></td></tr>';return}
  tbody.innerHTML=d.payments.map(p=>'<tr>'+
    '<td style="font-weight:600">'+esc(p.name||p.email||'-')+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(p.email||'-')+'</td>'+
    '<td style="font-weight:600">'+esc(p.amount)+' '+esc(p.currency)+'</td>'+
    '<td>'+esc(p.currency)+'</td>'+
    '<td><span class="badge badge-'+(p.status==='succeeded'?'premium':p.status==='failed'?'error':'inactive')+'">'+esc(paymentStatusLabel(p.status))+'</span></td>'+
    '<td>'+esc(p.provider)+'</td>'+
    '<td>'+esc(p.source)+'</td>'+
    '<td style="font-family:monospace;font-size:12px;color:var(--outline)">'+esc(p.provider_payment_id||'-')+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(p.created_at)+'</td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'payments-pagination','loadPaymentsTable');
}
document.getElementById('payments-filter-status').addEventListener('change',e=>{paymentStatusFilter=e.target.value;currentPage=1;loadPaymentsTable()});
document.getElementById('payments-filter-provider').addEventListener('change',e=>{paymentProviderFilter=e.target.value;currentPage=1;loadPaymentsTable()});

/* ═════════════════════ AI monitoring ═════════════════════ */
async function loadAI(){
  setChartC();
  const cards=document.getElementById('ai-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/ai-monitoring?days=30');
    dataCache.ai=d;
    renderAI(d);
  }catch(e){cards.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderAI(d){
  const cards=document.getElementById('ai-cards');
  const o=d.overview;
  cards.innerHTML=
    '<div class="stat-card"><div class="icon-bubble" style="background:#b1f0ce"><svg viewBox="0 0 24 24" fill="#0f5238"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.12-.1.17-.24.12-.37l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.12.1-.17.24-.12.37l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg></div><div class="info"><div class="value">'+o.total_requests+'</div><div class="label">'+esc(t('ai.totalRequests'))+'</div><div class="sub">'+o.success+' '+esc(t('ai.ok'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#ba1a1a;opacity:.12"><svg viewBox="0 0 24 24" fill="#ba1a1a"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg></div><div class="info"><div class="value">'+o.errors+'</div><div class="label">'+esc(t('ai.errorLabel'))+'</div><div class="sub">'+o.error_rate+'%</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#b45309;opacity:.12"><svg viewBox="0 0 24 24" fill="#b45309"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg></div><div class="info"><div class="value">'+o.avg_latency_ms+'ms</div><div class="label">'+esc(t('ai.avgLatencyLabel'))+'</div></div></div>'+
    '<div class="stat-card"><div class="icon-bubble" style="background:#d0ebbb"><svg viewBox="0 0 24 24" fill="#4e653f"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">'+fmtNum(o.total_tokens)+'</div><div class="label">'+esc(t('ai.tokensLabel'))+'</div><div class="sub">'+fmtNum(o.prompt_tokens)+' '+esc(t('ai.prompt'))+' / '+fmtNum(o.completion_tokens)+' '+esc(t('ai.completion'))+'</div></div></div>'+
  '</div>';
  renderLine('chart-ai-overview',d.timeseries,['requests'],[t('ai.requestsLabel')],getColors().primary);
  renderAIErrors(d.recent_errors);
  renderModels(d.models_used);
}
function renderModels(models){
  const tbody=document.getElementById('ai-models-tbody');
  if(!models.length){tbody.innerHTML='<tr><td colspan="5" class="empty"><p>'+esc(t('ai.noData'))+'</p></td></tr>';return}
  tbody.innerHTML=models.map(m=>'<tr>'+
    '<td style="font-weight:600">'+esc(m.model)+'</td>'+
    '<td>'+m.requests+'</td>'+
    '<td>'+m.errors+'</td>'+
    '<td>'+m.avg_latency_ms+'ms</td>'+
    '<td>'+fmtNum(m.tokens)+'</td>'+
  '</tr>').join('');
}
function renderAIErrors(errors){
  const tbody=document.getElementById('ai-errors-tbody');
  if(!errors.length){tbody.innerHTML='<tr><td colspan="3" class="empty"><p>'+esc(t('ai.noErrors'))+'</p></td></tr>';return}
  tbody.innerHTML=errors.map(e=>'<tr>'+
    '<td style="font-weight:600">'+esc(e.model||'-')+'</td>'+
    '<td class="error-text">'+esc(e.error)+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(e.created_at)+'</td>'+
  '</tr>').join('');
}

/* ═════════════════════ Notifications ═════════════════════ */
document.getElementById('notif-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=document.getElementById('notif-msg');
  msg.className='msg';msg.textContent=t('notifications.sending');
  const targetType=document.getElementById('notif-target').value;
  const payload={
    title:document.getElementById('notif-title').value,
    body:document.getElementById('notif-body').value,
    target_type:targetType
  };
  if(targetType==='specific'){
    const uid=document.getElementById('notif-user').value;
    if(!uid){msg.className='msg err';msg.textContent=t('notifications.userRequired');return}
    payload.target_user_id=Number(uid);
  }
  try{
    const d=await apiFetch('/admin/notifications/send',{method:'POST',body:JSON.stringify(payload)});
    msg.textContent=d.sent+'/'+d.targets+' '+t('notifications.sentCount');
    e.target.reset();
    loadNotifications();
  }catch(err){msg.className='msg err';msg.textContent=err.message}
});
document.getElementById('notif-target').addEventListener('change',e=>{
  document.getElementById('notif-user').style.display=e.target.value==='specific'?'block':'none';
});
async function loadNotifications(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('notif-tbody');
  tbody.innerHTML='<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/notifications?page='+currentPage+'&per_page=20');
    dataCache.notifications=d;
    renderNotifications(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="7" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderNotifications(d){
  const tbody=document.getElementById('notif-tbody');
  if(!d.notifications.length){tbody.innerHTML='<tr><td colspan="7" class="empty"><p>'+esc(t('notifications.noNotif'))+'</p></td></tr>';return}
  tbody.innerHTML=d.notifications.map(n=>'<tr>'+
    '<td style="font-weight:600">'+esc(n.title)+'</td>'+
    '<td style="color:var(--on-surface-v);max-width:280px">'+esc(n.body)+'</td>'+
    '<td><span class="badge badge-premium">'+esc(notifTargetLabel(n.target_type))+'</span></td>'+
    '<td>'+(n.status==='sent'?'<span class="badge badge-active">'+esc(t('notifications.sentBadge'))+'</span>':n.status==='partial'?'<span class="badge badge-progress">'+esc(t('notifications.partialBadge'))+'</span>':'<span class="badge badge-error">'+esc(t('notifications.failedBadge'))+'</span>')+'</td>'+
    '<td>'+n.sent_count+'</td>'+
    '<td>'+n.failed_count+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(n.created_at)+'</td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'notif-pagination','loadNotifications');
}

/* ═════════════════════ Audit ═════════════════════ */
let auditAction='';
async function loadAudit(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('audit-tbody');
  tbody.innerHTML='<tr><td colspan="6" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/audit-logs?action='+auditAction+'&page='+currentPage+'&per_page=20');
    dataCache.audit=d;
    renderAudit(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="6" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderAudit(d){
  const tbody=document.getElementById('audit-tbody');
  if(!d.logs.length){tbody.innerHTML='<tr><td colspan="6" class="empty"><p>'+esc(t('audit.noActions'))+'</p></td></tr>';return}
  tbody.innerHTML=d.logs.map(l=>'<tr>'+
    '<td><span class="badge badge-admin">'+esc(l.action)+'</span></td>'+
    '<td style="color:var(--on-surface-v)">'+esc(l.admin_email||'-')+'</td>'+
    '<td style="color:var(--on-surface-v)">'+esc(l.target_email||'-')+'</td>'+
    '<td class="error-text" style="font-size:12px">'+esc(l.details||'')+'</td>'+
    '<td>'+(l.result==='success'?'<span class="badge badge-active">'+esc(t('audit.ok'))+'</span>':'<span class="badge badge-error">'+esc(t('audit.err'))+'</span>')+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(l.created_at)+'</td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'audit-pagination','loadAudit');
  const sel=document.getElementById('audit-filter');
  if(sel.options.length<=1){sel.innerHTML='<option value="">'+esc(t('audit.allActions'))+'</option>'+d.actions.map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('')}
}
document.getElementById('audit-filter').addEventListener('change',e=>{auditAction=e.target.value;currentPage=1;loadAudit()});

/* ═════════════════════ System ═════════════════════ */
async function loadSystem(){
  setChartC();
  const el=document.getElementById('system-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await fetchCached('/admin/system');
    dataCache.system=s;
    renderSystem(s);
    loadErrorLogs();
  }catch(e){el.innerHTML='<p class="empty">'+esc(t('common.defaultError'))+'</p>'}
}
function renderSystem(s){
  const el=document.getElementById('system-content');
  const c=s.config;
  el.innerHTML=
    '<div class="sys-grid">'+
      '<div class="sys-card"><h3><span class="status-dot '+(s.database.ok?'ok':'err')+'"></span>'+esc(t('system.database'))+'</h3>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.status'))+'</span><span class="val">'+(s.database.ok?esc(t('system.connected')):esc(t('system.dbError')))+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.errors24h'))+'</span><span class="val">'+s.errors_24h+'</span></div>'+
        (s.database.error?'<div class="sys-row"><span class="key">'+esc(t('system.dbError'))+'</span><span class="val error-text">'+esc(s.database.error)+'</span></div>':'')+
      '</div>'+
      '<div class="sys-card"><h3>'+esc(t('system.config'))+'</h3>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.environment'))+'</span><span class="val">'+esc(c.environment)+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.llm'))+'</span><span class="val">'+esc(c.llm_primary)+' / '+esc(c.llm_model)+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.monetization'))+'</span><span class="val">'+esc(c.monetization_mode)+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.freeSessions'))+'</span><span class="val">'+c.free_sessions_per_week+esc(t('system.perWeek'))+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.rateLimiting'))+'</span><span class="val">'+(c.rate_limit_enabled?esc(t('system.enabled'))+' ('+c.rate_limit_chat+')':esc(t('system.disabled')))+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.encryption'))+'</span><span class="val">'+(c.field_encryption_enabled?esc(t('system.enabled')):esc(t('system.disabled')))+'</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.premiumPrice'))+'</span><span class="val">'+c.premium_price_monthly+'$ / '+c.premium_price_yearly+'$</span></div>'+
        '<div class="sys-row"><span class="key">'+esc(t('system.cors'))+'</span><span class="val">'+c.cors_origins+'</span></div>'+
      '</div>'+
    '</div>';
}
async function loadErrorLogs(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('errors-tbody');
  tbody.innerHTML='<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const d=await apiFetch('/admin/system/errors?page='+currentPage+'&per_page=20');
    dataCache.errors=d;
    renderErrorLogs(d);
  }catch(e){tbody.innerHTML='<tr><td colspan="5" class="empty">'+esc(t('common.defaultError'))+'</td></tr>'}
}
function renderErrorLogs(d){
  const tbody=document.getElementById('errors-tbody');
  if(!d.errors.length){tbody.innerHTML='<tr><td colspan="5" class="empty"><p>'+esc(t('system.noErrors'))+'</p></td></tr>';return}
  tbody.innerHTML=d.errors.map(e=>'<tr>'+
    '<td><span class="badge badge-error">'+esc(e.source)+'</span></td>'+
    '<td style="color:var(--on-surface-v);font-size:13px">'+(e.method||'')+' '+esc(e.path||'')+'</td>'+
    '<td class="error-text">'+esc(e.message)+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+esc(e.detail||'')+'</td>'+
    '<td style="color:var(--outline);font-size:13px">'+fmtDateTime(e.created_at)+'</td>'+
  '</tr>').join('');
  renderPagination(d.page,d.pages,d.total,'errors-pagination','loadErrorLogs');
}

/* ── Init ── */
applyTranslations();
if(token)showApp();

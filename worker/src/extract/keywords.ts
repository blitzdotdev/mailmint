// Keyword tables for code extraction.
//
// Many of the multilingual code keywords below are adapted from
// dreamhunter2333/cloudflare_temp_email `worker/src/email/extract_code.ts`
// (MIT, Copyright (c) 2023 Dream Hunter), which in turn adapts keyword lists
// from 2FHey (https://github.com/SoFriendly/2fhey, CC0-1.0). See ATTRIBUTION.md.

/**
 * Words that name the code itself ("verification code", "OTP", "验证码").
 * A candidate right next to one of these is almost certainly the code.
 */
const STRONG: string[] = [
	// English
	'verification\\s{0,3}codes?', 'verify\\s{0,3}codes?', 'confirm(?:ation)?\\s{0,3}codes?', 'security\\s{0,3}codes?',
	'log[\\s-]?in\\s{0,3}codes?', 'sign[\\s-]?in\\s{0,3}codes?', 'sign[\\s-]?up\\s{0,3}codes?', 'access\\s{0,3}codes?',
	'auth(?:entication|orization)?\\s{0,3}codes?', 'activation\\s{0,3}codes?', 'validation\\s{0,3}codes?',
	'launch\\s{0,3}codes?', 'two[\\s-]?factor\\s{0,3}codes?', '2fa\\s{0,3}codes?', 'mfa\\s{0,3}codes?',
	'one[\\s-]?time\\s{0,3}(?:pass(?:word|code)|code|pin|password)', 'single[\\s-]?use\\s{0,3}codes?',
	'temporary\\s{0,3}(?:\\w+\\s{1,3})?(?:login\\s{1,3})?codes?', 'passcodes?', 'otp', 'pin(?:\\s{0,3}codes?)?', 'totp', 'captcha',
	'codes?',
	// Chinese
	'验证码', '驗證碼', '校验码', '校驗碼', '认证码', '認證碼', '确认码', '確認碼', '动态码', '動態碼', '动态密码', '動態密碼',
	'动态口令', '短信口令', '安全码', '安全代码', '登录码', '登入码', '激活码', '一次性密码', '校验代码', '识别码', '随机码', '交易码',
	// Japanese
	'認証コード', '確認コード', '認証番号', '確認番号', 'ワンタイムパスワード', 'ワンタイムパスコード', 'パスコード',
	'セキュリティコード', '確認用コード', 'ログインコード', '認証キー',
	// Korean
	'인증\\s{0,3}코드', '인증\\s{0,3}번호', '확인\\s{0,3}코드', '보안\\s{0,3}코드', '인증번호', '승인\\s{0,3}번호',
	// Spanish / Portuguese / Italian
	'c[óo]digos?(?!\\s{1,3}postal)', 'codice', 'contrase[ñn]a\\s{1,3}de\\s{1,3}un\\s{1,3}solo\\s{1,3}uso', 'senha\\s{1,3}tempor[áa]ria',
	// French
	'code\\s{1,3}(?:de\\s{1,3}(?:s[ée]curit[ée]|v[ée]rification|confirmation|connexion|validation)|d[\'’](?:authentification|acc[èe]s|activation))',
	// German / Dutch
	'(?:best[äa]tigungs|verifizierungs|sicherheits|anmelde|einmal|aktivierungs|zugangs|login|freigabe)-?code', 'einmalkennwort', 'einmalpasswort',
	'verificatiecode', 'beveiligingscode', 'inlogcode',
	// Turkish / Polish / Czech
	'(?<![\\p{L}])kod(?:u|y)?(?![\\p{L}])', 'doğrulama\\s{0,3}kodu', 'weryfikacyjny',
	// Russian / Ukrainian
	'(?<![\\p{L}])код(?:\\s{1,3}(?:подтверждения|проверки|доступа|входа|безопасности))?(?![\\p{L}])', 'одноразов\\p{L}{0,4}\\s{1,3}пароль',
	// Hebrew / Arabic / Hindi / Vietnamese / Indonesian / Thai
	'קוד(?:\\s{1,3}(?:האימות|אימות))?', 'رمز(?:\\s{1,3}(?:التحقق|التأكيد))?', 'كود', 'कोड', 'ओटीपी', 'mã\\s{1,3}(?:xác\\s{1,3}(?:minh|nhận)|otp)', 'kode(?:\\s{1,3}verifikasi)?', 'รหัส',
];

/** Context words: not a name for the code, but typical of verification mail. */
const WEAK: string[] = [
	'verif(?:y|ied|ying|ication)', 'confirm(?:ation)?', 'authenticat(?:e|ion|or)', 'two[\\s-]?factor', '2fa', 'mfa',
	'sign[\\s-]?(?:in|up)', 'log[\\s-]?(?:in|on)', 'activat(?:e|ion)', 'validat(?:e|ion)', 'expires?', 'valid\\s{1,3}for',
	'验证', '驗證', '認証', '인증', 'подтвержд\\p{L}*', 'best[äa]tig\\p{L}*', 'verific\\p{L}*', 'v[ée]rifi\\p{L}*', 'gültig',
];

/**
 * Phrases that, when they directly label a number, mean it is NOT a code.
 * Matched case-insensitively against the text right before a candidate.
 */
const NEGATIVE_LABEL: string[] = [
	// commerce / logistics
	'order(?:\\s{0,3}(?:#|no\\.?|nr\\.?|number|num|id|ref(?:erence)?))?', 'invoice(?:\\s{0,3}(?:#|no\\.?|number))?', 'receipt(?:\\s{0,3}(?:#|no\\.?|number))?',
	'ticket(?:\\s{0,3}(?:#|no\\.?|id|number))?', 'case(?:\\s{0,3}(?:#|no\\.?|id|number))?', 'ref(?:erence)?(?:\\s{0,3}(?:#|no\\.?|id|number|numbers?\\(s\\)))?',
	'booking(?:\\s{0,3}(?:#|no\\.?|ref(?:erence)?|number|code))?', 'reservation(?:\\s{0,3}(?:#|no\\.?|number|code))?',
	'confirmation\\s{0,3}(?:#|no\\.?|number|num)', 'tracking(?:\\s{0,3}(?:#|no\\.?|id|number|code))?', 'shipment(?:\\s{0,3}(?:#|no\\.?|id|number))?',
	'parcel', 'package(?:\\s{0,3}(?:#|id|number))?', 'awb', 'waybill', 'consignment',
	'account(?:\\s{0,3}(?:#|no\\.?|nr\\.?|number|id))', 'customer(?:\\s{0,3}(?:#|no\\.?|number|id))', 'member(?:ship)?(?:\\s{0,3}(?:#|no\\.?|number|id))',
	'transaction(?:\\s{0,3}(?:#|no\\.?|id|number))?', 'payment(?:\\s{0,3}(?:#|id|number))', 'request\\s{0,3}id', 'user\\s{0,3}id', 'id',
	'item(?:\\s{0,3}(?:#|no\\.?|number))?', 'sku', 'model(?:\\s{0,3}(?:#|no\\.?|number))?', 'serial(?:\\s{0,3}(?:#|no\\.?|number))?', 'part(?:\\s{0,3}(?:#|no\\.?|number))',
	'po(?:\\s{0,3}(?:#|number))', 'flight', 'seat', 'gate', 'room', 'suite', 'ste\\.?', 'unit', 'apt\\.?', 'floor', 'building', 'p\\.?\\s?o\\.?\\s{0,3}box', 'box',
	'zip(?:\\s{0,3}code)?', 'postal(?:\\s{0,3}code)?', 'post\\s{0,3}code', 'postcode', 'plz', 'cp', 'cep', 'hrb', 'hra', 'vat(?:\\s{0,3}(?:no\\.?|number|id))?',
	'ust-?idnr\\.?', 'tax\\s{0,3}id', 'ein', 'abn', 'siret', 'nif', 'build', 'version', 'ver\\.?', 'rev\\.?', 'release', 'step', 'page', 'chapter',
	'no\\.', 'nr\\.', 'nº', 'n°', 'iban', 'bic', 'routing', 'ending\\s{1,3}in', 'card(?:\\s{0,3}(?:#|number|ending))?', 'visa', 'mastercard', 'amex',
	// code-like phrases that are not one-time codes
	'promo(?:tion(?:al)?)?\\s{0,3}code', 'coupon(?:\\s{0,3}code)?', 'discount(?:\\s{0,3}code)?', 'gift(?:\\s{0,3}card)?\\s{0,3}code', 'voucher(?:\\s{0,3}code)?',
	'referral(?:\\s{0,3}code)?', 'invit(?:e|ation)\\s{0,3}code', 'offer\\s{0,3}code', 'sale\\s{0,3}code', 'redemption\\s{0,3}code', 'redeem(?:\\s{0,3}code)?',
	'ref(?:erence)?\\s{0,3}code', 'order\\s{0,3}code', 'item\\s{0,3}number', 'area\\s{0,3}code', 'country\\s{0,3}code', 'source\\s{0,3}code', 'error(?:\\s{0,3}code)?', 'status(?:\\s{0,3}code)?', 'qr\\s{0,3}code', 'bar\\s{0,3}code',
	'dress\\s{0,3}code', 'product\\s{0,3}code', 'item\\s{0,3}code', 'style\\s{0,3}code', 'color\\s{0,3}code', 'colour\\s{0,3}code', 'swift\\s{0,3}code', 'sort\\s{0,3}code',
	// phone
	'tel\\.?', 'tél\\.?', 'phone', 'telephone', 'mobile', 'cell', 'fax', 'call(?:\\s{1,3}us)?(?:\\s{1,3}(?:at|on))?', 'text(?:\\s{1,3}us)?', 'sms\\s{1,3}to', 'whatsapp',
	'hotline', 'helpline', 'toll[\\s-]?free', 'ring', 'telefon', 'tel[ée]fono', 'telefone', 'téléphone', 'телефон', 'тел\\.?', 'служба\\s{1,3}поддержки',
	'电话', '電話', '热线', '熱線', '客服(?:热线|電話|电话)?', '고객센터', '전화', '문의', 'お問い合わせ', '問い合わせ', 'atención\\s{1,3}al\\s{1,3}cliente', 'kundenservice',
	// money
	'price', 'total', 'subtotal', 'amount', 'balance', 'cost', 'fee', 'paid', 'due', 'refund', 'charged?', 'points?',
	// misc identifiers
	'bestellnummer', 'bestellung', 'rechnung(?:snummer)?', 'kundennummer', 'sendungsnummer', 'auftragsnummer', 'pedido', 'factura', 'n[úu]mero\\s{1,3}de\\s{1,3}pedido',
	'commande', 'facture', 'заказ\\p{L}*', 'номер\\s{1,3}заказа', '订单号?', '單號', '单号', '快递单号', '運單', '注文番号', '注文', '주문번호', '운송장',
];

const ALPHA = 'A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u0590-\\u05FF\\u0600-\\u06FF\\u0900-\\u097F';

function compile(list: string[]): RegExp {
	// Word boundaries only against alphabetic scripts: CJK keywords sit inside running text.
	return new RegExp(`(?<![${ALPHA}0-9])(?:${list.join('|')})(?![${ALPHA}])`, 'giu');
}

export const STRONG_RE = compile(STRONG);
export const WEAK_RE = compile(WEAK);

/** Negative label that ends exactly at the end of the given text (allowing a delimiter). */
export const NEGATIVE_LABEL_END_RE = new RegExp(
	`(?<![\\p{L}\\p{N}])(?:${NEGATIVE_LABEL.join('|')})\\s{0,3}(?:#|:|：|=|-|is|was|ist|es|est)?\\s{0,3}(?:#\\s{0,2})?$`,
	'iu',
);

/**
 * Bare "code"/"codes" preceded by one of these words is not a one-time code.
 * (Checked separately because STRONG includes bare "code".)
 */
export const NEGATED_CODE_PREFIX_RE =
	/(?:promo(?:tion(?:al)?)?|coupon|discount|gift(?:\s{0,3}card)?|voucher|referral|invit(?:e|ation)|offer|sale|redemption|redeem|zip|postal|post|area|country|source|error|status|tracking|order|reference|ref|booking|reservation|qr|bar|dress|product|item|style|colou?r|swift|sort|html|sample|recovery|backup)[\s-]{0,3}$/i;

/** Promotional context: numbers/codes near these are coupon codes or prices. */
export const PROMO_RE =
	/(?<![\p{L}])(?:promo|coupon|discount|voucher|\d+\s?%\s?off|% off|checkout|sale|deal|offer|gift\s?card|referral|redeem|rabatt|gutschein|descuento|cup[oó]n|cupom|r[ée]duction|優惠|优惠|折扣|クーポン|割引|할인|쿠폰|скидк\p{L}*|промокод)(?![\p{L}])/iu;

/** Lines that are boilerplate footers (legal, address, unsubscribe). */
export const FOOTER_LINE_RE =
	/©|\(c\)\s*\d{4}|copyright|all rights reserved|registered trademark|unsubscribe|you(?:'re| are) receiving|this (?:e-?mail|message) was sent|was intended for|amtsgericht|handelsregister|ust-?idnr|geschäftsführer|impressum|版权所有|版權所有|著作権|〒|사업자등록번호|todos los derechos|tous droits|alle rechte/i;

/** Month / weekday / date words (for rejecting years). */
export const DATE_WORD_RE =
	/(?<![\p{L}])(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|januar|februar|märz|mai|juni|juli|oktober|dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre|since|est\.?|established|founded|year|years|année|jahr|año|ano|©|copyright|until|through|by|on|in|of|from|to|between|date|dated|fy|q[1-4]|20\d\d[-/.]|[年月日])(?![\p{L}])/iu;

/** "Enter"/"use" verbs that directly precede a code. */
export const ENTER_VERB_RE =
	/(?:\b(?:enter|use|input|type|paste|copy|provide)\b(?:\s{1,3}(?:the|this|your|following))?(?:\s{1,3}(?:verification|security|one-time|login|sign-in))?(?:\s{1,3}code)?|输入|填写|輸入|입력|入力|введите|ingres[aá]|introduce|digite|insira|eingeben|geben sie|saisissez|entrez|inserisci)\s{0,3}[:：]?\s{0,3}$/iu;

/** "is"-style delimiter right before a code: "code is 123456", "验证码为：123456". */
export const DELIM_END_RE = /(?:[:：=]|(?<![\p{L}])(?:is|was|are|ist|lautet|est|es|é|è|são|sono|är|er|is:)(?![\p{L}])|是|为|為|は|는|은|です|：|הוא|هو)\s{0,8}[\[【(（「『"'“]?\s{0,3}$/iu;

/** Subject/body words showing the message asks to verify, confirm or sign in. */
export const VERIFY_CONTEXT_RE =
	/(?<![\p{L}])(?:verif\p{L}*|confirm\p{L}*|activat\p{L}*|validat\p{L}*|sign[\s-]?(?:in|up)|log[\s-]?(?:in|on)|magic\s?link|one[\s-]?time|passcode|otp|2fa|two[\s-]?factor|authenticat\p{L}*|invit\p{L}*|reset|password|passwort|contrase[ñn]a|senha|mot de passe)(?![\p{L}])|验证|驗證|認証|인증|подтвержд|bestätig|verific|vérifi|登录|ログイン|로그인/iu;

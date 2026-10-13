// Extractor tests: every .eml fixture against expected.json, plus focused
// unit tests for the strings that most often fool OTP/link extractors.
//
// Run: node --test --experimental-strip-types tests/extract.test.mjs   (from worker/)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { extract } from '../src/extract/index.ts';
import { parseEml } from './helpers/parse-eml.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/extract/', import.meta.url));
const expected = JSON.parse(readFileSync(join(FIXTURES, 'expected.json'), 'utf8'));
const emlFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.eml')).sort();

/** Shorthand for plain-text input. */
function x(text, subject = '', html = null) {
	return extract({ subject, text, html });
}
const codeOf = (text, subject = '', html = null) => x(text, subject, html).best.code;
const linkOf = (text, subject = '', html = null) => x(text, subject, html).best.link;

describe('fixture corpus', () => {
	test('every fixture has an expectation and vice versa', () => {
		assert.deepEqual(Object.keys(expected).sort(), emlFiles);
		assert.ok(emlFiles.length >= 30, `need >= 30 fixtures, have ${emlFiles.length}`);
	});

	for (const file of emlFiles) {
		test(file, async () => {
			const exp = expected[file];
			assert.ok(exp, `missing expectation for ${file}`);
			const input = await parseEml(readFileSync(join(FIXTURES, file)));
			assert.ok(input.text || input.html, `${file}: parser produced no body`);
			const out = extract(input);
			const dump = JSON.stringify({ codes: out.codes, links: out.links.slice(0, 4) }, null, 1);

			assert.equal(out.best.code, exp.code, `${file}: best.code\n${dump}`);

			if (exp.link === null) {
				assert.equal(out.best.link, null, `${file}: best.link should be null\n${dump}`);
			} else {
				assert.ok(out.best.link, `${file}: expected a best.link\n${dump}`);
				assert.ok(
					out.best.link === exp.link || out.best.link.startsWith(exp.link),
					`${file}: best.link\n  got      ${out.best.link}\n  expected ${exp.link}\n${dump}`,
				);
				if (exp.linkKind) {
					const top = out.links.find((l) => l.url === out.best.link);
					assert.equal(top?.kind, exp.linkKind, `${file}: link kind\n${dump}`);
				}
			}
			// Invariants that hold for every message.
			assert.ok(out.codes.length <= 5);
			assert.ok(out.links.length <= 10);
			for (const c of out.codes) assert.ok(!/\n/.test(c.context), 'context must be single-line');
			for (let i = 1; i < out.codes.length; i++) assert.ok(out.codes[i - 1].score >= out.codes[i].score);
			for (let i = 1; i < out.links.length; i++) assert.ok(out.links[i - 1].score >= out.links[i].score);
			assert.equal(new Set(out.codes.map((c) => c.value)).size, out.codes.length, 'codes deduped');
			assert.equal(new Set(out.links.map((l) => l.url)).size, out.links.length, 'links deduped');
			for (const l of out.links) assert.match(l.url, /^https?:\/\//);
		});
	}
});

describe('API shape', () => {
	test('empty input', () => {
		assert.deepEqual(extract({ subject: '', text: null, html: null }), {
			codes: [],
			links: [],
			best: { code: null, link: null },
		});
	});

	test('candidate fields', () => {
		const out = x('Your verification code is 482913. It expires in 10 minutes.', 'Verify your email');
		assert.equal(out.codes.length, 1);
		const c = out.codes[0];
		assert.equal(c.value, '482913');
		assert.equal(typeof c.score, 'number');
		assert.match(c.context, /482913/);
		assert.ok(c.context.length <= 90, `context too long: ${c.context.length}`);
	});

	test('same code in subject and body is returned once', () => {
		const out = x('Your code is 482913', '482913 is your Acme code', '<p>Your code is <b>482913</b></p>');
		assert.deepEqual(out.codes.map((c) => c.value), ['482913']);
		assert.equal(out.best.code, '482913');
	});

	test('caps: at most 5 codes and 10 links', () => {
		const many = Array.from({ length: 12 }, (_, i) => `Verification code ${i + 1}: ${100000 + i * 7919}`).join('\n');
		const out = x(many, 'Verification codes');
		assert.ok(out.codes.length <= 5);
		const links = Array.from({ length: 15 }, (_, i) => `<a href="https://ex.com/verify?token=tok${i}abcdefghijklmnop">Verify ${i}</a>`).join('');
		assert.ok(x(null, 'Verify', links).links.length <= 10);
	});
});

describe('codes: positives', () => {
	test('keyword before, colon', () => assert.equal(codeOf('Verification code: 482913'), '482913'));
	test('keyword after ("is your ... code")', () => assert.equal(codeOf('', '482913 is your Instagram code'), '482913'));
	test('code in subject only', () => assert.equal(codeOf('Open the app and enter the code.', '730215 is your Acme login code'), '730215'));
	test('Google G- prefix', () => assert.equal(codeOf('G-482913 is your Google verification code.'), '482913'));
	test('letter prefix with longer tag', () => assert.equal(codeOf('Please use SGD-604187 within 3 minutes. Your OTP for login.'), '604187'));
	test('space-grouped 123 456', () => assert.equal(codeOf('Your code: 482 913'), '482913'));
	test('dash-grouped 123-456', () => assert.equal(codeOf('Enter 832-901 to continue', 'Security code'), '832901'));
	test('verb-labelled code', () => assert.equal(codeOf('Please verify your email. Use 4821 to continue.'), '4821'));
	test('spaced single digits', () => assert.equal(codeOf('Your verification code is 8 4 9 2 0 1'), '849201'));
	test('4-digit PIN', () => assert.equal(codeOf('Your PIN code: 4821'), '4821'));
	test('8-digit code', () => assert.equal(codeOf('Confirmation code 48291036'), '48291036'));
	test('code on its own line under a label line', () =>
		assert.equal(codeOf('Enter this code to sign in:\n\n591204\n\nThis code expires in 10 minutes.'), '591204'));
	test('alnum code near keyword', () => assert.equal(codeOf('Your login code: X7K9QP'), 'X7K9QP'));
	test('grouped alnum kept verbatim', () => assert.equal(codeOf('Your confirmation code: AB12-CD34'), 'AB12-CD34'));
	test('all-caps grouped (Slack style)', () => assert.equal(codeOf('Your confirmation code is below:\n\nKQZ-DMT\n', 'Slack confirmation code: KQZ-DMT'), 'KQZ-DMT'));
	test('lowercase alnum (X login style)', () => assert.equal(codeOf('Please enter this code to complete the login: 7kq2vx9m', 'Your X confirmation code is 7kq2vx9m'), '7kq2vx9m'));
	test('full-width digits are folded', () => assert.equal(codeOf('您的验证码：４８２９１３'), '482913'));
	test('zero-width chars inside a code', () => assert.equal(codeOf('Your code is 48​29‌13'), '482913'));
	test('OTP after an amount', () => assert.equal(codeOf('OTP for payment of Rs 5000 is 482913'), '482913'));
	test('year-like but explicitly labelled', () => assert.equal(codeOf('Your verification code is 2019'), '2019'));
	test('code wins over copyright year', () =>
		assert.equal(codeOf('© 2026 Acme Inc. Your verification code is 771204.'), '771204'));
	test('emphasised code in HTML after an instruction', () =>
		assert.equal(
			codeOf(null, 'Verify your email', '<p>Enter the code below to verify your email.</p><table><tr><td style="font-size:32px;letter-spacing:6px;font-family:monospace"><strong>604187</strong></td></tr></table>'),
			'604187',
		));
});

describe('codes: mixed signals', () => {
	test('reference code next to the real code is not listed', () => {
		const out = x('Your code is 482913. Reference code 991204.', 'Your code');
		assert.equal(out.best.code, '482913');
		assert.ok(!out.codes.some((c) => c.value === '991204'), JSON.stringify(out.codes));
	});
	test('account id line above the code', () => assert.equal(codeOf('Account ID: 48291345\nYour verification code is 604187', 'Verify'), '604187'));
	test('body is only the code, subject names it', () => assert.equal(codeOf('482913', 'Your verification code'), '482913'));
	test('emphasised year above the real code', () =>
		assert.equal(
			codeOf(null, 'Verify', '<div style="font-size:40px;font-weight:bold">2026</div><p>Verify your email with the code below</p><div style="font-size:40px;letter-spacing:8px">604187</div>'),
			'604187',
		));
});

describe('codes: languages', () => {
	test('Chinese 验证码', () => assert.equal(codeOf('【腾讯云】您的验证码为：590362，5分钟内有效，请勿泄露。'), '590362'));
	test('Chinese with a small number right after', () => assert.equal(codeOf('验证码 590362 5分钟内有效'), '590362'));
	test('Chinese code-first', () => assert.equal(codeOf('590362（登录验证码），请勿泄露。'), '590362'));
	test('Japanese 認証コード', () => assert.equal(codeOf('認証コードは 813574 です。有効期限は10分です。'), '813574'));
	test('Korean 인증번호', () => assert.equal(codeOf('[Web발신] 인증번호 [482913]를 입력해주세요.'), '482913'));
	test('Spanish código', () => assert.equal(codeOf('Tu código de verificación es 731590.'), '731590'));
	test('Portuguese código', () => assert.equal(codeOf('Seu código de verificação: 731590'), '731590'));
	test('French', () => assert.equal(codeOf('Votre code de vérification est : 482913'), '482913'));
	test('German Bestätigungscode lautet', () => assert.equal(codeOf('Ihr Bestätigungscode lautet: 246813'), '246813'));
	test('Russian код', () => assert.equal(codeOf('Ваш код подтверждения: 482913'), '482913'));
	test('Hindi कोड', () => assert.equal(codeOf('आपका सत्यापन कोड 482913 है।'), '482913'));
	test('Italian codice', () => assert.equal(codeOf('Il tuo codice di verifica è 482913'), '482913'));
});

describe('codes: things that must never be a code', () => {
	const noCode = (name, text, subject = '', html = null) =>
		test(name, () => {
			const out = x(text, subject, html);
			assert.equal(out.best.code, null, JSON.stringify(out.codes));
		});

	noCode('plain prose', 'Thanks for joining. Have a great day.', 'Welcome!');
	noCode('year in copyright footer', '© 2024 Acme Inc. All rights reserved.', 'Welcome');
	noCode('year near date words', 'Join us on October 12, 2025 for our annual summit. Since 1998 we have grown.', 'Save the date');
	noCode('price with $', 'You paid $4821 for your order. Thanks!', 'Receipt');
	noCode('price with currency word', 'Total due: 4821 USD by Friday.', 'Invoice');
	noCode('price with thousands separator', 'Now only €1.299,00 or $1,299.00', 'Sale');
	noCode('phone number US', 'Questions? Call us at (800) 555-0199 or +1 415 555 0132.', 'Your account');
	noCode('phone number UK', 'Ring 0800 123 4567 or +44 20 7946 0958', 'Help');
	noCode('phone after "call"', 'Call 4821930 for support.', 'Help');
	noCode('Order #123456', 'Thanks for your purchase! Order #123456 has been received.', 'Order confirmation');
	noCode('Order number label', 'Order number: 482913\nWe will email you when it ships.', 'Your order confirmation');
	noCode('Invoice / ticket / reference numbers', 'Invoice 4829130. Ticket ID: 773120. Reference: 991204. Account number 55120934.', 'Your request');
	noCode('confirmation number (booking)', 'Your booking confirmation number is 4829130.', 'Booking confirmed');
	noCode('hex color in text', 'Brand colour #123456 and #a1b2c3', 'Style guide');
	noCode(
		'hex colors and CSS values in HTML',
		null,
		'Hello',
		'<html><head><style>.x{color:#123456;width:600px} @media (max-width:6000px){.y{padding:1234px}}</style></head><body bgcolor="#654321"><table width="600" style="max-width:6000px;color:#112233"><tr><td height="4821">Hello there, welcome aboard.</td></tr></table></body></html>',
	);
	noCode('zip codes in an address', 'Acme Inc., 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA', 'Welcome');
	noCode('German address + Handelsregister', 'Beispiel GmbH, Musterstraße 12, 10115 Berlin. Amtsgericht Charlottenburg HRB 123456. USt-IdNr. DE123456789', 'Willkommen');
	noCode('tracking numbers', 'Tracking number: 1Z999AA10123456784\nUSPS 9400111899223197428490\nTracking code: 482913', 'Your package has shipped');
	noCode('dates and times', 'Signed in on 2024-10-12 at 10:15 UTC (12/10/2024). Ref 20241012.', 'New sign-in');
	noCode('version numbers and IPs', 'Chrome 129.0.6668.90 on macOS 14.6.1 from 203.0.113.42, build 4821', 'New sign-in to your account');
	noCode('number inside a URL', 'Visit https://example.com/verify/482913?id=771204 to continue', 'Verify');
	noCode('promo code', 'Use code SAVE20 at checkout for 20% off. Promo code 482913 expires Sunday.', 'Sale ends soon');
	noCode('plain caps words near keyword', 'YOUR CODE IS BELOW. PLEASE VERIFY YOUR ACCOUNT.', 'VERIFY');
	noCode('quantities', 'You have 4821 points and 1500 followers. 2500 miles earned.', 'Your monthly summary');
	noCode('percent and units', 'Storage at 4821 MB, 9000 px wide, 1234%', 'Usage');
	noCode('2FA enabled notice (keywords, no code)', 'Two-factor authentication was enabled on your account on Oct 12, 2024 at 10:15 UTC. Use your recovery codes if you lose your device.', '[Acme] Two-factor authentication enabled');
	noCode('status / error codes', 'Status code 404. Error code 500123.', 'Deploy failed');
	noCode('build number near "code"', 'Your code is ready! Download build 482913 from the dashboard.', 'Build ready');
	noCode('booking reference (alnum)', 'Booking reference: X7K9QP. Your flight BA 2491 departs at 14:30.', 'Your booking');
	noCode('Russian order + phone', 'Ваш заказ 48291345 оформлен. Телефон: 8 800 555 3535', 'Заказ');
	noCode('Chinese order + hotline', '您的订单号：482913570，客服电话：400-820-8820', '订单确认');
	noCode('big emphasised number in a sale mail', null, 'Black Friday', '<h1 style="font-size:48px">482913</h1><p>Our biggest sale ever</p>');
	noCode('sign-in counts and years', 'We received 1500 sign-in attempts. Your account is locked until 2027.', 'Security alert');
	noCode('credit card fragments', 'Card ending in 4242. Card 4242 4242 4242 4242 charged.', 'Payment received');
});

describe('codes: candidate list excludes traps', () => {
	test('hex color in HTML attributes never becomes a candidate', () => {
		const out = x(null, 'Your code', '<td style="color:#123456" bgcolor="#654321">Your verification code is <b>482913</b></td>');
		assert.equal(out.best.code, '482913');
		assert.ok(!out.codes.some((c) => c.value === '123456' || c.value === '654321'));
	});
	test('zip + street numbers excluded alongside a real code', () => {
		const out = x('Your verification code is 604187.\n\nGoogle LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043', 'Verify');
		assert.equal(out.best.code, '604187');
		assert.ok(!out.codes.some((c) => ['94043', '1600'].includes(c.value)), JSON.stringify(out.codes));
	});
	test('phone number next to a code is not a candidate', () => {
		const out = x('Your security code is 284713. Not you? Call 1-800-555-0199.', 'Security code');
		assert.equal(out.best.code, '284713');
		assert.ok(!out.codes.some((c) => c.value.includes('555')));
	});
});

describe('links', () => {
	test('anchor href with &amp; is decoded', () => {
		const out = x(null, 'Verify your email', '<a href="https://app.example.com/verify?token=abcDEF123456ghiJKL&amp;email=a%40b.dev">Verify email</a>');
		assert.equal(out.best.link, 'https://app.example.com/verify?token=abcDEF123456ghiJKL&email=a%40b.dev');
		assert.equal(out.links[0].kind, 'verify');
		assert.equal(out.links[0].text, 'Verify email');
	});
	test('bare URL in text', () => {
		assert.equal(linkOf('Click below to verify your email:\nhttps://ex.com/confirm/9f8e7d6c5b4a39281706\n'), 'https://ex.com/confirm/9f8e7d6c5b4a39281706');
	});
	test('trailing punctuation and angle brackets stripped', () => {
		assert.equal(linkOf('Confirm your account <https://ex.com/activate?k=Zx81Pq0LmN7vB2cX4d>.', 'Activate'), 'https://ex.com/activate?k=Zx81Pq0LmN7vB2cX4d');
	});
	test('magic link kind', () => {
		const out = x(null, 'Your Magic Link', '<a href="https://ref.supabase.co/auth/v1/verify?token=pkce_8d7f6a5b4c3d2e1f&amp;type=magiclink&amp;redirect_to=http://localhost:3000">Log In</a>');
		assert.equal(out.best.link, 'https://ref.supabase.co/auth/v1/verify?token=pkce_8d7f6a5b4c3d2e1f&type=magiclink&redirect_to=http://localhost:3000');
		assert.equal(out.links[0].kind, 'magic');
	});
	test('reset kind', () => {
		const out = x(null, 'Reset your password', '<a href="https://ex.com/password_reset/aB3dE5fG7hJ9kL1mN3pQ">Reset password</a>');
		assert.equal(out.links[0].kind, 'reset');
	});
	test('unsubscribe / preferences / privacy / social / app store / mailto / tel / # dropped', () => {
		const html = `
			<a href="https://ex.com/verify?token=Qw8Er7Ty6Ui5Op4As3Df">Verify email</a>
			<a href="https://ex.com/unsubscribe?u=Qw8Er7Ty6Ui5Op4As3Df">Unsubscribe</a>
			<a href="https://ex.com/email-preferences">Manage preferences</a>
			<a href="https://ex.com/privacy">Privacy</a>
			<a href="https://ex.com/legal/terms">Terms</a>
			<a href="https://help.ex.com/hc/en-us">Help Center</a>
			<a href="https://twitter.com/exampleco">Twitter</a>
			<a href="https://www.facebook.com/exampleco">Facebook</a>
			<a href="https://apps.apple.com/app/id1234567890">App Store</a>
			<a href="https://play.google.com/store/apps/details?id=com.ex">Google Play</a>
			<a href="mailto:support@ex.com">Email us</a>
			<a href="tel:+18005550199">Call</a>
			<a href="#top">Back to top</a>
			<a href="https://ex.com/">Example</a>
			<img src="https://ex.com/open.gif?id=Qw8Er7Ty6Ui5Op4As3Df" width="1" height="1">`;
		const out = x(null, 'Verify your email', html);
		assert.deepEqual(out.links.map((l) => l.url), ['https://ex.com/verify?token=Qw8Er7Ty6Ui5Op4As3Df']);
	});
	test('only an unsubscribe link -> no best link', () => {
		assert.equal(linkOf(null, 'News', '<a href="https://ex.com/unsubscribe?t=Qw8Er7Ty6Ui5Op4As3Df">Unsubscribe</a>'), null);
	});
	test('Outlook SafeLinks unwrapped (with &amp;)', () => {
		const inner = 'https://ex.com/verify?token=Qw8Er7Ty6Ui5Op4As3Df&email=a%40b.dev';
		const wrapped = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(inner)}&amp;data=05%7C02%7C%7Cabc&amp;sdata=xyz%3D&amp;reserved=0`;
		assert.equal(linkOf(null, 'Verify', `<a href="${wrapped}">Verify email</a>`), inner);
	});
	test('google.com/url?q= unwrapped', () => {
		const inner = 'https://ex.com/confirm?t=Qw8Er7Ty6Ui5Op4As3Df';
		const wrapped = `https://www.google.com/url?q=${encodeURIComponent(inner)}&amp;sa=D&amp;source=editors&amp;ust=1728712345678&amp;usg=AOvVaw0abc`;
		assert.equal(linkOf(null, 'Confirm', `<a href="${wrapped}">Confirm your account</a>`), inner);
	});
	test('generic redirector path with ?url= / ?u= / ?target= / ?redirect= unwrapped', () => {
		const inner = 'https://ex.com/activate?k=Qw8Er7Ty6Ui5Op4As3Df';
		for (const [path, key] of [['/redirect', 'url'], ['/r', 'u'], ['/out', 'target'], ['/click', 'redirect']]) {
			const wrapped = `https://links.mailer.example${path}?${key}=${encodeURIComponent(inner)}&amp;sig=abc123`;
			assert.equal(linkOf(null, 'Activate', `<a href="${wrapped}">Activate account</a>`), inner, path);
		}
	});
	test('AWS SES awstrack wrapper unwrapped', () => {
		const inner = 'https://ex.com/verify?token=Qw8Er7Ty6Ui5Op4As3Df';
		const wrapped = `https://abcd1234.r.us-east-1.awstrack.me/L0/${encodeURIComponent(inner)}/1/0100019276abcdef-12345678-aaaa-bbbb-cccc-1234567890ab-000000/AbCdEfGh=391`;
		assert.equal(linkOf(null, 'Verify', `<a href="${wrapped}">Verify</a>`), inner);
	});
	test('magic link redirect_to param is NOT unwrapped', () => {
		const link = 'https://ref.supabase.co/auth/v1/verify?token=abc123def456ghi789&type=signup&redirect_to=https://app.example.com/welcome';
		assert.equal(linkOf(null, 'Confirm your signup', `<a href="${link.replaceAll('&', '&amp;')}">Confirm your mail</a>`), link);
	});
	test('unwrap failure keeps original', () => {
		const wrapped = 'https://nam12.safelinks.protection.outlook.com/?url=not-a-url&data=05';
		const out = x(null, 'Verify', `<a href="${wrapped.replaceAll('&', '&amp;')}">Verify email</a>`);
		assert.equal(out.links[0]?.url, wrapped);
	});
	test('wrapped tracking link scored by anchor text', () => {
		const out = x(null, 'Verify Email Address for Discord', '<a href="https://click.discord.com/ls/click?upn=u001.Zx81Pq0LmN7vB2cX4dQw8Er7Ty6">Verify Email</a><a href="https://click.discord.com/ls/click?upn=u001.AAAAbbbbCCCCdddd1111">Twitter</a>');
		assert.equal(out.best.link, 'https://click.discord.com/ls/click?upn=u001.Zx81Pq0LmN7vB2cX4dQw8Er7Ty6');
		assert.equal(out.links[0].kind, 'verify');
	});
	test('workspace invite link', () => {
		const out = x(null, 'Bob invited you to join Acme on Slack', '<a href="https://join.slack.com/t/acme/invite/zt-2abc9DEF8ghi7JKL6mno">Join Now</a> <a href="https://slack.com/intl/en-gb/help">Help</a>');
		assert.equal(out.best.link, 'https://join.slack.com/t/acme/invite/zt-2abc9DEF8ghi7JKL6mno');
		assert.equal(out.links[0].kind, 'verify');
	});
	test('redirector-looking magic link carrying its own token is not unwrapped', () => {
		const out = x(null, 'Sign in to Acme', '<a href="https://acme.example/auth/link?token=Zx81Pq0LmN7vB2cX4dQw&amp;to=https%3A%2F%2Facme.example%2Fhome">Sign in</a>');
		assert.equal(out.best.link, 'https://acme.example/auth/link?token=Zx81Pq0LmN7vB2cX4dQw&to=https%3A%2F%2Facme.example%2Fhome');
		assert.equal(out.links[0].kind, 'magic');
	});
	test('security-alert escape hatches are not action links', () => {
		const html = '<a href="https://acme.example/security/review?s=Zx81Pq0LmN7vB2cX4dQw">Secure your account</a> <a href="https://acme.example/account/devices?d=Zx81Pq0LmN7vB2cX4dQw">This wasn\'t me</a> <a href="https://acme.example/settings/password?s=Zx81Pq0LmN7vB2cX4dQw">Change your password</a>';
		assert.equal(linkOf(null, 'New sign-in to your Acme account', html), null);
	});
	test('cancel link next to verify link is dropped', () => {
		const out = x(null, 'Verify your email', '<a href="https://acme.example/verify?t=Zx81Pq0LmN7vB2cX4dQw">Verify</a> Didn\'t sign up? <a href="https://acme.example/cancel-signup?t=Zx81Pq0LmN7vB2cX4dQw">Cancel</a>');
		assert.deepEqual(out.links.map((l) => l.url), ['https://acme.example/verify?t=Zx81Pq0LmN7vB2cX4dQw']);
	});
	test('link-free marketing mail has no best link', () => {
		const html = '<a href="https://shop.example.com/sale?utm_source=newsletter&amp;utm_medium=email">Shop the sale</a><a href="https://shop.example.com/blog/fall-guide">Read the guide</a>';
		assert.equal(linkOf(null, 'Fall sale', html), null);
	});
	test('duplicate link (HTML + text) returned once', () => {
		const url = 'https://ex.com/verify?token=Qw8Er7Ty6Ui5Op4As3Df';
		const out = x(`Verify your email: ${url}`, 'Verify', `<a href="${url}">Verify email</a>`);
		assert.equal(out.links.filter((l) => l.url === url).length, 1);
	});
	test('non-http schemes ignored', () => {
		assert.deepEqual(x('mailto:a@b.com ftp://x.com/verify javascript:alert(1)', 'Verify').links, []);
	});
});

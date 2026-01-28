import type { PageServerLoad } from './$types';
import type { ServerInfo } from '$lib/collector';

const JOINMISSKEY_API = 'https://instanceapp.misskey.page/instances.json';

// joinmisskey APIのインスタンス情報をServerInfoに変換
interface JoinMisskeyInstance {
	url: string;
	langs: string[];
	name?: string;
	description?: string;
	isAlive: boolean;
	value?: number; // アクティビティスコア（直近のアクティビティ指標）
	dru15?: number; // Daily Read Users (15日平均) - アクティブ閲覧ユーザー数
	npd15?: number; // Notes Per Day (15日平均) - 1日あたりのノート数
	meta?: {
		name?: string;
		description?: string;
		version?: string;
		repositoryUrl?: string;
		disableRegistration?: boolean;
		emailRequiredForSignup?: boolean;
		approvalRequiredForSignup?: boolean;
		iconUrl?: string;
		serverRules?: string[];
		policies?: {
			canInvite?: boolean;
		};
	};
	nodeinfo?: {
		software?: {
			name?: string;
			version?: string;
			repository?: string;
		};
		usage?: {
			users?: {
				total?: number;
			};
			localPosts?: number;
		};
		openRegistrations?: boolean;
	};
	iconUrl?: string;
}

interface JoinMisskeyResponse {
	instancesInfos: JoinMisskeyInstance[];
}

function convertToServerInfo(instance: JoinMisskeyInstance): ServerInfo | null {
	if (!instance.isAlive) return null;

	const version = instance.nodeinfo?.software?.version ?? instance.meta?.version ?? '';
	const usersCount = instance.nodeinfo?.usage?.users?.total ?? null;

	// リポジトリURLを取得
	const repositoryUrl = instance.nodeinfo?.software?.repository ?? instance.meta?.repositoryUrl ?? null;

	// 年齢制限の推測（name, description, serverRulesから判定）
	const serverRulesText = (instance.meta?.serverRules ?? []).join(' ');
	const allText = `${instance.name ?? ''} ${instance.description ?? ''} ${serverRulesText}`.toLowerCase();

	let ageRestriction: 'all' | '13+' | '18+' | 'unknown' = 'unknown';

	// 18+判定パターン
	const is18Plus = /18\+|18歳以上|成人|成年|アダルト|r-?18|nsfw/.test(allText);
	// 13+判定パターン
	const is13Plus = /13\+|13歳|13才|中学生以上/.test(allText);

	if (is18Plus) {
		ageRestriction = '18+';
	} else if (is13Plus) {
		ageRestriction = '13+';
	} else if (instance.meta?.emailRequiredForSignup) {
		// メール必須サーバーは13+と推測（多くのサービスが13歳以上を要求）
		ageRestriction = '13+';
	}

	// URLからホスト名を抽出
	let host = instance.url;
	try {
		// URLの場合はホスト名を抽出
		if (host.includes('://')) {
			host = new URL(host).hostname;
		}
		// 末尾のスラッシュを削除
		host = host.replace(/\/$/, '');
	} catch {
		// パースに失敗したらそのまま使用
	}

	// 登録状態の判定
	const registrationOpen = instance.nodeinfo?.openRegistrations ??
		(instance.meta?.disableRegistration !== true);

	// 承認制の判定
	const approvalRequired = instance.meta?.approvalRequiredForSignup === true;

	// 招待制の判定（canInviteがfalseの場合、招待できない=招待制ではない）
	// ただし、登録が閉じていて承認制でない場合は招待制の可能性が高い
	const inviteOnly = !registrationOpen && !approvalRequired;

	// アイコンURLを取得（相対パスの場合は絶対URLに変換）
	let iconUrl = instance.iconUrl ?? instance.meta?.iconUrl ?? null;
	if (iconUrl && !iconUrl.startsWith('http')) {
		iconUrl = `https://${host}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
	}

	return {
		host,
		name: instance.name ?? instance.meta?.name ?? null,
		description: instance.description ?? instance.meta?.description ?? null,
		usersCount,
		notesCount: instance.nodeinfo?.usage?.localPosts ?? null,
		iconUrl,
		softwareName: instance.nodeinfo?.software?.name ?? 'misskey',
		softwareVersion: version,
		repositoryUrl,
		registrationOpen,
		emailRequired: instance.meta?.emailRequiredForSignup === true,
		approvalRequired,
		inviteOnly,
		ageRestriction,
		dru15: instance.dru15 ?? null,
		npd15: instance.npd15 ?? null
	};
}

interface FederationInfo {
	sourceHost: string;
	targetHost: string;
	usersCount: number;
	notesCount: number;
	isBlocked: boolean;
	isSuspended: boolean;
}

// 主要サーバーから連合情報を取得（ブロック/サスペンド情報も含む）
async function fetchFederations(seedHost: string, knownHosts: Set<string>): Promise<FederationInfo[]> {
	try {
		const res = await fetch(`https://${seedHost}/api/federation/instances`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 100, sort: '+pubSub' })
		});

		if (!res.ok) return [];

		const instances = (await res.json()) as Array<{
			host: string;
			usersCount?: number;
			notesCount?: number;
			isBlocked?: boolean;
			isSuspended?: boolean;
		}>;

		// 正常な連合関係のみ返す（ブロック/サスペンドは除外）
		return instances
			.filter((inst) => !inst.isBlocked && !inst.isSuspended && knownHosts.has(inst.host))
			.map((inst) => ({
				sourceHost: seedHost,
				targetHost: inst.host,
				usersCount: inst.usersCount ?? 0,
				notesCount: inst.notesCount ?? 0,
				isBlocked: false,
				isSuspended: false
			}));
	} catch {
		return [];
	}
}

// ブロック/サスペンド関係を取得
async function fetchBlockedRelations(seedHost: string, knownHosts: Set<string>): Promise<FederationInfo[]> {
	try {
		const res = await fetch(`https://${seedHost}/api/federation/instances`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 30, blocked: true })
		});

		if (!res.ok) return [];

		const instances = (await res.json()) as Array<{
			host: string;
			usersCount?: number;
			notesCount?: number;
			isBlocked?: boolean;
			isSuspended?: boolean;
		}>;

		return instances
			.filter((inst) => knownHosts.has(inst.host))
			.map((inst) => ({
				sourceHost: seedHost,
				targetHost: inst.host,
				usersCount: inst.usersCount ?? 0,
				notesCount: inst.notesCount ?? 0,
				isBlocked: inst.isBlocked ?? false,
				isSuspended: inst.isSuspended ?? false
			}));
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const res = await fetch(JOINMISSKEY_API);
		if (!res.ok) {
			console.error('Failed to fetch joinmisskey API:', res.status);
			return { servers: [], federations: [] };
		}

		const data = (await res.json()) as JoinMisskeyResponse;

		// 日本語サーバーのみをフィルタリング
		const japaneseServers = data.instancesInfos
			.filter((instance) => instance.langs.includes('ja'))
			.map(convertToServerInfo)
			.filter((server): server is ServerInfo => server !== null);

		const knownHosts = new Set(japaneseServers.map((s) => s.host));

		// ヘルパー関数: URLからホスト名を抽出
		const extractHost = (url: string): string => {
			let host = url;
			try {
				if (host.includes('://')) {
					host = new URL(host).hostname;
				}
				host = host.replace(/\/$/, '');
			} catch {
				// パースに失敗したらそのまま使用
			}
			return host;
		};

		// 全基準（dru15, npd15, users）のトップ10を事前計算（クライアント側でAPI呼び出し不要に）
		const topByDru15 = data.instancesInfos
			.filter((instance) => instance.langs.includes('ja') && instance.isAlive && (instance.dru15 ?? 0) > 0)
			.sort((a, b) => (b.dru15 ?? 0) - (a.dru15 ?? 0))
			.slice(0, 10)
			.map(instance => extractHost(instance.url));

		const topByNpd15 = data.instancesInfos
			.filter((instance) => instance.langs.includes('ja') && instance.isAlive && (instance.npd15 ?? 0) > 0)
			.sort((a, b) => (b.npd15 ?? 0) - (a.npd15 ?? 0))
			.slice(0, 10)
			.map(instance => extractHost(instance.url));

		const topByUsers = japaneseServers
			.filter((server) => (server.usersCount ?? 0) > 0)
			.sort((a, b) => (b.usersCount ?? 0) - (a.usersCount ?? 0))
			.slice(0, 10)
			.map(server => server.host);

		// 全候補を統合（重複排除）
		const allCandidates = Array.from(new Set([...topByDru15, ...topByNpd15, ...topByUsers]));

		// 全候補の連合情報を並列取得（一度に全部取得して使い回す）
		const [federationsArrays, blockedArrays] = await Promise.all([
			Promise.all(allCandidates.map((host) => fetchFederations(host, knownHosts))),
			Promise.all(allCandidates.map((host) => fetchBlockedRelations(host, knownHosts)))
		]);
		const federations = [...federationsArrays.flat(), ...blockedArrays.flat()];

		// 連合情報が取得できたサーバーのセット
		const serversWithFederation = new Set<string>();
		for (const fed of federations) {
			serversWithFederation.add(fed.sourceHost);
		}

		// 各基準のトップ候補を連合情報があるものだけにフィルタリング
		const filteredTopByDru15 = topByDru15.filter(host => serversWithFederation.has(host));
		const filteredTopByNpd15 = topByNpd15.filter(host => serversWithFederation.has(host));
		const filteredTopByUsers = topByUsers.filter(host => serversWithFederation.has(host));

		return {
			servers: japaneseServers,
			federations,
			defaultViewpoints: filteredTopByDru15.slice(0, 3), // デフォルトはdru15の上位3件
			topByDru15: filteredTopByDru15,
			topByNpd15: filteredTopByNpd15,
			topByUsers: filteredTopByUsers
		};
	} catch (e) {
		console.error('Failed to load servers:', e);
		return { servers: [], federations: [], defaultViewpoints: [] };
	}
};

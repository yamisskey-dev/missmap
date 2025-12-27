export type AgeRestriction = 'all' | '13+' | '18+' | 'unknown';
export type ServerScale = 'large' | 'medium' | 'small';

export interface ServerFilter {
	// 登録要件
	emailNotRequired: boolean;
	approvalRequired: boolean;
	inviteOnly: boolean;
	registrationOpen: boolean;

	// 年齢制限
	ageRestriction: AgeRestriction | null;

	// リポジトリURL（複数選択可能）
	repositoryUrls: string[];

	// 規模
	scale: ServerScale[];
}

export const DEFAULT_FILTER: ServerFilter = {
	emailNotRequired: false,
	approvalRequired: false,
	inviteOnly: false,
	registrationOpen: false,
	ageRestriction: null,
	repositoryUrls: [],
	scale: []
};

export type ViewMode = 'merged' | 'single';

export interface UserSettings {
	seedServer: string; // 現在フォーカス中のサーバー
	viewpointServers: string[]; // 視点サーバーのリスト
	viewMode: ViewMode; // 表示モード
}

export const DEFAULT_SETTINGS: UserSettings = {
	seedServer: 'misskey.io',
	viewpointServers: ['misskey.io'],
	viewMode: 'merged'
};

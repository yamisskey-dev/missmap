export type AgeRestriction = 'all' | '13+' | '18+' | 'unknown';
export type ServerScale = 'large' | 'medium' | 'small';

// 新規登録の状態（複数選択可能）
export type RegistrationStatus = 'open' | 'approval' | 'invite' | 'closed';

// メールアドレスの要件
export type EmailRequirement = 'required' | 'notRequired' | null;

export interface ServerFilter {
	// 新規登録（複数選択可能）
	registrationStatus: RegistrationStatus[];

	// メールアドレス要件
	emailRequirement: EmailRequirement;

	// 年齢制限
	ageRestriction: AgeRestriction | null;

	// リポジトリURL（複数選択可能）
	repositoryUrls: string[];

	// 規模
	scale: ServerScale[];
}

export const DEFAULT_FILTER: ServerFilter = {
	registrationStatus: [],
	emailRequirement: null,
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

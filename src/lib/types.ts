export type AgeRestriction = 'all' | '13+' | '18+' | 'unknown';
export type ServerScale = 'large' | 'medium' | 'small';

// 新規登録の状態（複数選択可能）
export type RegistrationStatus = 'open' | 'approval' | 'invite' | 'closed';

// メールアドレスの要件
export type EmailRequirement = 'required' | 'notRequired' | null;

// エッジ（関係線）の表示設定
export interface EdgeVisibility {
	showFederation: boolean;      // 通常の連合関係を表示
	showBlocked: boolean;         // ブロック関係を表示
	showSuspended: boolean;       // 配信停止関係を表示
	showConnectivityOk: boolean;  // 疎通OK関係を表示
	showConnectivityNg: boolean;  // 疎通NG関係を表示
}

export const DEFAULT_EDGE_VISIBILITY: EdgeVisibility = {
	showFederation: true,
	showBlocked: true,
	showSuspended: true,
	showConnectivityOk: true,
	showConnectivityNg: true
};

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

	// エッジ表示設定
	edgeVisibility: EdgeVisibility;
}

export const DEFAULT_FILTER: ServerFilter = {
	registrationStatus: [],
	emailRequirement: null,
	ageRestriction: null,
	repositoryUrls: [],
	scale: [],
	edgeVisibility: { ...DEFAULT_EDGE_VISIBILITY }
};

export interface UserSettings {
	viewpointServers: string[]; // 視点サーバーのリスト
}

export const DEFAULT_SETTINGS: UserSettings = {
	viewpointServers: ['misskey.io']
};

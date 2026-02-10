export interface User {
    id: string;
    name: string;
    email: string;
}

export interface PullRequest {
    id: string;
    number: number;
    title: string;
    status: string;
}

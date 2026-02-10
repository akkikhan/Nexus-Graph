import { simpleGit } from 'simple-git';

export const git = simpleGit();

export async function getCurrentBranch() {
    const status = await git.status();
    return status.current;
}

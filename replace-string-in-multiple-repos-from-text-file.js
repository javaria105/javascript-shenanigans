// This script reads a list of repositories from a text file and processes 
// each repository to find a string and replace it with another string.
// It then creates a PR for each repository with the changes.
// Note: this will give an error if the base branch is not called 'main'. Change the branch name in the code if needed.
// To do: Maybe add logic to look at main or master branch and use that as the base branch.

const { Octokit } = require("@octokit/rest");
const fs = require('fs');
const path = require('path');

const octokit = new Octokit({ auth: `` });

const owner = '';
const searchString = '';
const replaceString = '';
const newBranch = '';
const commitMessage = '';
const prTitle = '';
const prBody = '';

// Read repository names from a text file called repos.txt
const repos = fs.readFileSync('repos.txt', 'utf-8').split('\n').filter(Boolean);

async function getTreeRecursive(owner, repo, treeSha) {
    const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: true
    });
    return treeData.tree;
}

async function processBlob(owner, repo, file, searchString, replaceString) {
    const { data: blobData } = await octokit.git.getBlob({
        owner,
        repo,
        file_sha: file.sha
    });

    const content = Buffer.from(blobData.content, 'base64').toString();
    const lines = content.split('\n');
    const matchedLines = lines.filter(line => line.includes(searchString));

    if (matchedLines.length > 0) {
        const updatedContent = content.replace(new RegExp(searchString, 'g'), replaceString);

        fs.appendFileSync('matched_lines.txt', matchedLines.join('\n') + '\n');

        const blob = await octokit.git.createBlob({
            owner,
            repo,
            content: Buffer.from(updatedContent).toString('base64'),
            encoding: 'base64'
        });

        return {
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: blob.data.sha
        };
    }

    return null;
}

async function processTree(owner, repo, treeSha, searchString, replaceString) {
    const tree = await getTreeRecursive(owner, repo, treeSha);
    const newTreeEntries = [];

    for (const file of tree) {
        if (file.type === 'blob') {
            const newEntry = await processBlob(owner, repo, file, searchString, replaceString);
            if (newEntry) {
                newTreeEntries.push(newEntry);
            }
        }
    }

    return newTreeEntries;
}

// Function to search for a string in the repository and replace it
async function searchAndReplace(repo) {
    try {
        const { data: refData } = await octokit.git.getRef({
            owner,
            repo,
            ref: 'heads/main'
        });

        const mainSha = refData.object.sha;

        await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${newBranch}`,
            sha: mainSha
        });

        const newTreeEntries = await processTree(owner, repo, mainSha, searchString, replaceString);

        if (newTreeEntries.length > 0) {
            const newTree = await octokit.git.createTree({
                owner,
                repo,
                tree: newTreeEntries,
                base_tree: mainSha
            });

            const commit = await octokit.git.createCommit({
                owner,
                repo,
                message: commitMessage,
                tree: newTree.data.sha,
                parents: [mainSha]
            });

            await octokit.git.updateRef({
                owner,
                repo,
                ref: `heads/${newBranch}`,
                sha: commit.data.sha
            });

            const { data: pr } = await octokit.pulls.create({
                owner,
                repo,
                title: prTitle,
                head: newBranch,
                base: 'main',
                body: prBody
            });

            console.log(`Pull Request created for ${repo}: ${pr.html_url}`);
        } else {
            console.log(`No changes to commit for ${repo}.`);
        }
    } catch (error) {
        console.error(`Error in repository ${repo}:`, error);
    }
}

// Loop over each repository and call searchAndReplace
(async () => {
    for (const repo of repos) {
        await searchAndReplace(repo);
    }
})();

// This script searches a specified repo to find a string and replace it with another string. 
// It then creates a new branch, commits the changes, and creates a pull request.
// Note: this will give an error if the base branch is not called 'main'. Change the branch name in the code if needed.
// To do: Maybe add logic to look at main or master branch and use that as the base branch.

const { Octokit } = require("@octokit/rest");
const fs = require('fs');
const path = require('path');

const octokit = new Octokit({ auth: `YOUR_GITHUB_TOKEN_HERE` });

const owner = 'YOUR_ORG_NAME_HERE';
const repo = 'YOUR_REPO_NAME_HERE';
const searchString = 'STRING_YOU_WANT_TO_FIND';
const replaceString = 'STRING_YOU_WANT_TO_REPLACE_WITH';
const newBranch = 'YOUR_NEW_BRANCH_NAME';
const commitMessage = 'YOUR_COMMIT_MESSAGE';
const prTitle = 'YOUR_PR_TITLE';
const prBody = 'YOUR_PR_BODY_TEXT';

// Function to get the tree of a repository recursively
async function getTreeRecursive(owner, repo, treeSha) {
    const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: true
    });
    return treeData.tree;
}

// Function to process a blob (file) in a repository and add matched string lines to a file.
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

// Function to process the tree in a repo recursively
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
async function searchAndReplace() {
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

            console.log(`Pull Request created: ${pr.html_url}`);
        } else {
            console.log('No changes to commit.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

searchAndReplace();

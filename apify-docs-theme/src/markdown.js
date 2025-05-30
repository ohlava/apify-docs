const remarkParse = require('remark-parse').default;
const remarkStringify = require('remark-stringify').default;
const { unified } = require('unified');
const { visitParents, CONTINUE } = require('unist-util-visit-parents');

/**
 * Bumps the headings levels in the markdown content. This function increases the depth
 * of all headings in the content by 1. This is useful when the content is included in
 * another markdown file with a higher-level heading.
 * @param {*} tree Remark AST tree.
 * @returns {void} Nothing. This function modifies the tree in place.
 */
const incrementHeadingLevels = () => (tree) => {
    visitParents(tree, 'heading', (node) => {
        if (node.depth === 1 && node.children[0].value === 'Changelog') return;

        node.depth += 1;
    });
};

const removeGitCliffMarkers = () => (tree) => {
    visitParents(tree, 'html', (node) => {
        const gitCliffMarkerRegex = /generated by git-cliff/ig;
        const match = gitCliffMarkerRegex.exec(node.value);

        if (match) node.value = '';
    });
};

/**
 * Links user tags in the markdown content. This function replaces the user tags
 * (e.g. `@username`) with a link to the user's GitHub profile (just like GitHub's UI).
 * @param {*} tree Remark AST tree.
 * @returns {void} Nothing. This function modifies the tree in place.
 */
const linkifyUserTags = () => (tree) => {
    visitParents(tree, 'text', (node, parents) => {
        const userTagRegex = /@([a-zA-Z0-9-]+)(\s|$)/g;
        const match = userTagRegex.exec(node.value);

        const directParent = parents[parents.length - 1];

        if (!match || directParent.type === 'link') return CONTINUE;

        const nodeIndexInParent = directParent.children.findIndex((x) => x === node);

        const username = match[1];
        const ending = match[2] === ' ' ? ' ' : '';
        const before = node.value.slice(0, match.index);
        const after = node.value.slice(userTagRegex.lastIndex);

        const link = {
            type: 'link',
            url: `https://github.com/${username}`,
            children: [{ type: 'text', value: `@${username}` }],
        };
        node.value = before;
        directParent.children.splice(nodeIndexInParent + 1, 0, link);

        if (!after) return [CONTINUE, nodeIndexInParent + 2];

        directParent.children.splice(nodeIndexInParent + 2, 0, { type: 'text', value: `${ending}${after}` });
        return [CONTINUE, nodeIndexInParent + 3];
    });
};

/**
 * Prettifies PR links in the markdown content. Just like GitHub's UI, this function
 * replaces the full PR URL with a link represented by the PR number (prefixed by a hashtag).
 * @param {*} tree Remark AST tree.
 * @returns {void} Nothing. This function modifies the tree in place.
 */
const prettifyPRLinks = () => (tree) => {
    visitParents(tree, 'text', (node, parents) => {
        const prLinkRegex = /https:\/\/github.com\/[^\s]+\/pull\/(\d+)/g;
        const match = prLinkRegex.exec(node.value);

        if (!match) return CONTINUE;

        const directParent = parents[parents.length - 1];
        const nodeIndexInParent = directParent.children.findIndex((x) => x === node);

        const prNumber = match[1];
        const before = node.value.slice(0, match.index);
        const after = node.value.slice(prLinkRegex.lastIndex);

        const link = {
            type: 'link',
            url: match[0],
            children: [{ type: 'text', value: `#${prNumber}` }],
        };
        node.value = before;

        directParent.children.splice(nodeIndexInParent + 1, 0, link);
        if (!after) return [CONTINUE, nodeIndexInParent + 1];

        directParent.children.splice(nodeIndexInParent + 2, 0, { type: 'text', value: after });
        return [CONTINUE, nodeIndexInParent + 2];
    });
};

/**
 * Adds frontmatter to the markdown content.
 * @param {string} changelog The markdown content.
 * @param {string} title The frontmatter title.
 * @returns {string} The markdown content with frontmatter.
 */
function addFrontmatter(changelog, title = 'Changelog') {
    return `---
title: ${title}
sidebar_label: ${title}
toc_max_heading_level: 3
---
${changelog}`;
}

/**
 * Escapes the MDX-related characters in the markdown content.
 * This is required by Docusaurus v3 and its dependencies (see the v3 [migration guide](https://docusaurus.io/docs/migration/v3#common-mdx-problems)).
 * @param {string} changelog The markdown content.
 * @returns {string} The markdown content with escaped MDX characters.
 */
function escapeMDXCharacters(changelog) {
    return changelog.replaceAll(/<|>/g, (match) => {
        return match === '<' ? '&lt;' : '&gt;';
    }).replaceAll(/\{|\}/g, (match) => {
        return match === '{' ? '&#123;' : '&#125;';
    });
}

/**
 * Updates the markdown content for better UX and compatibility with Docusaurus v3.
 * @param {string} changelog The markdown content.
 * @returns {string} The updated markdown content.
 */
function updateChangelog(changelog) {
    const pipeline = unified()
        .use(remarkParse)
        .use(removeGitCliffMarkers)
        .use(incrementHeadingLevels)
        .use(prettifyPRLinks)
        .use(linkifyUserTags)
        .use(remarkStringify);

    changelog = pipeline.processSync(changelog).toString();
    changelog = addFrontmatter(changelog);
    changelog = escapeMDXCharacters(changelog);
    return changelog;
}

module.exports = {
    updateChangelog,
};

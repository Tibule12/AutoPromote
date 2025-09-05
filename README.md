# AutoPromote Documentation

This directory contains the documentation for the AutoPromote project, which is hosted on GitHub Pages using a dedicated `gh-pages` branch.

## Available Documentation

- [Overview](index.md) - General information about the AutoPromote project
- [Installation Guide](installation.md) - Instructions for setting up the project locally
- [Troubleshooting Guide](troubleshooting.md) - Solutions for common issues
- [HTML Navigation](home.html) - Web-based documentation navigation

## Updating Documentation

To update the documentation:

1. Edit the relevant Markdown (.md) or HTML files in this directory
2. Run the `setup-gh-pages.bat` script in the root directory
3. The script will automatically:
   - Create a gh-pages branch if it doesn't exist
   - Copy the documentation files from the docs folder to the root of the gh-pages branch
   - Commit and push the changes to the gh-pages branch

## GitHub Pages Configuration

The project's GitHub Pages site is configured to use:
- Branch: gh-pages
- Folder: / (root)

All files in the root of the gh-pages branch will be published to the GitHub Pages site.

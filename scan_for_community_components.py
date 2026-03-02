import os
import re

def remove_comments(text):
    def replacer(match):
        s = match.group(0)
        if s.startswith('/'):
            # Replace comment content with spaces, but keep newlines to preserve line numbers
            return "".join(['\n' if c == '\n' else ' ' for c in s])
        else:
            return s
            
    # Regex to capture comments (line and block) and strings (single and double quotes)
    pattern = re.compile(
        r'//.*?$|/\*[\s\S]*?\*/|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"',
        re.MULTILINE
    )
    
    return pattern.sub(replacer, text)

def scan_directory(root_dir):
    keywords = ["CommunityPage", "CommunityPanel"]
    
    # print(f"Scanning {root_dir}")
    
    for dirpath, _, filenames in os.walk(root_dir):
        # Scan for common frontend extensions
        for filename in filenames:
            if filename.lower().endswith(('.js', '.jsx', '.ts', '.tsx')):
                filepath = os.path.join(dirpath, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    clean_content = remove_comments(content)
                    lines = clean_content.splitlines()
                    
                    found_title = False
                    for i, line in enumerate(lines):
                        for keyword in keywords:
                            if keyword in line:
                                print(f"{filepath}:{i+1}")
                                print(f"Line: {line.strip()}")
                            
                except Exception as e:
                    print(f"Could not read {filepath}: {e}")

if __name__ == "__main__":
    # Adjust path to match the user request: c:\Users\asus\AutoPromte\AutoPromote\frontend\src
    # Assuming script runs from root c:\Users\asus\AutoPromte\AutoPromote
    target_dir = os.path.join(os.getcwd(), 'frontend', 'src')
    if os.path.exists(target_dir):
        scan_directory(target_dir)
    else:
        print(f"Directory not found: {target_dir}")

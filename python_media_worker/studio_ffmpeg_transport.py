"""Pass large native filter graphs without exceeding OS argument limits."""
from contextlib import contextmanager
from pathlib import Path
import os
import tempfile


@contextmanager
def ffmpeg_filter_scripts(command):
    # Preserve option order and exact graph bytes. Only FFmpeg filter values
    # move to private files; media paths and all other arguments stay intact.
    args = [str(value) for value in command]
    options = {
        '-filter_complex': '-filter_complex_script',
        '-vf': '-filter_script:v', '-filter:v': '-filter_script:v',
        '-af': '-filter_script:a', '-filter:a': '-filter_script:a',
    }
    if not args or os.path.basename(args[0]).lower() != 'ffmpeg':
        yield args
        return
    with tempfile.TemporaryDirectory(prefix='autopromote-filter-') as directory:
        for index in range(1, len(args) - 1):
            option = options.get(args[index])
            if option and len(args[index + 1].encode('utf-8')) >= 64 * 1024:
                script = Path(directory) / f'{index}.ffgraph'
                with script.open('x', encoding='utf-8', newline='') as stream:
                    os.chmod(script, 0o600)
                    stream.write(args[index + 1])
                args[index:index + 2] = [option, str(script)]
        yield args

"""Actual FFmpeg decoding and file cleanup, independent of cloud runtimes."""
from pathlib import Path
import os
import subprocess
import pytest
from python_media_worker.studio_ffmpeg_transport import ffmpeg_filter_scripts


@pytest.mark.parametrize('option,graph,mapping', [
    ('-vf', 'scale=8:8', []),
    ('-filter_complex', '[0:v]scale=8:8[out]', ['-map', '[out]']),
    ('-af', 'volume=0.5', []),
])
def test_large_graph_uses_exact_private_script_and_produces_the_same_decoded_samples(option, graph, mapping):
    source = 'sine=frequency=440:duration=0.1' if option == '-af' else 'testsrc2=size=16x16:rate=24:duration=0.1'
    base = ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', source]
    output = mapping + ['-f', 'framemd5', '-']
    expected = subprocess.check_output(base + [option, graph] + output)
    large = graph + ' ' * (160 * 1024)
    with pytest.raises(OSError):
        subprocess.run(base + [option, large] + output, check=True, capture_output=True)
    with ffmpeg_filter_scripts(base + [option, large] + output) as args:
        script_option = '-filter_complex_script' if option == '-filter_complex' else '-filter_script:' + ('a' if option == '-af' else 'v')
        script = Path(args[args.index(script_option) + 1])
        assert script.read_text() == large
        assert os.stat(script).st_mode & 0o777 == 0o600
        assert subprocess.check_output(args) == expected
    assert not script.exists()


def test_small_filters_and_non_ffmpeg_commands_remain_unchanged_and_failure_cleans_files():
    for command in [['ffmpeg', '-vf', 'scale=8:8'], ['another-tool', '-vf', 'x' * 160000]]:
        with ffmpeg_filter_scripts(command) as args:
            assert args == command
    with pytest.raises(RuntimeError):
        with ffmpeg_filter_scripts(['ffmpeg', '-vf', 'x' * 160000]) as args:
            script = Path(args[2])
            assert script.exists()
            raise RuntimeError('launch or worker failure')
    assert not script.exists()

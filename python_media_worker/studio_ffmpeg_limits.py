"""Optional operator thread budget for the shared Studio composition command."""
import os


def bounded_studio_ffmpeg_command(command):
    budget = str(os.environ.get("MEDIA_WORKER_STUDIO_FFMPEG_THREADS") or "").strip()
    if not budget:
        return list(command)
    if not budget.isdecimal() or not 1 <= int(budget) <= 8:
        raise ValueError("MEDIA_WORKER_STUDIO_FFMPEG_THREADS must be an integer from 1 to 8")
    if not command or os.path.basename(str(command[0])).lower() != "ffmpeg":
        raise ValueError("Studio thread limits require an FFmpeg command")
    result = [command[0], "-filter_threads", budget, "-filter_complex_threads", budget]
    for argument in command[1:]:
        if argument == "-i":
            result.extend(["-threads", "1"])
        result.append(argument)
    return [*result[:-1], "-threads", budget, result[-1]]

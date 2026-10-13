"""Bounded PCM pairing; preserve level and DC errors alongside correlation."""
import numpy as np
from scipy.signal import correlate


def pair_pcm_window(search, reference):
    search = np.asarray(search, dtype=np.float64)
    reference = np.asarray(reference, dtype=np.float64)
    if search.ndim == 1:
        search = search[:, None]
        reference = reference[:, None]
    size = len(reference)
    if not size or len(search) < size or search.shape[1] != reference.shape[1]:
        raise ValueError('Insufficient or incompatible PCM window')
    centered = reference - reference.mean(axis=0)
    reference_energy = np.sum(centered ** 2)
    if reference_energy < 1e-12:
        return {'status': 'SILENT_REFERENCE', 'correlation': None}
    values = sum(correlate(search[:, c], centered[:, c], mode='valid', method='fft')
                 for c in range(search.shape[1]))
    sums = np.vstack((np.zeros(search.shape[1]), np.cumsum(search, axis=0)))
    window_sums = sums[size:] - sums[:-size]
    squared = np.concatenate(([0.0], np.cumsum(np.sum(search ** 2, axis=1))))
    # Both signals must be centered. Centering only the reference makes even
    # identical low-frequency windows falsely fail the correlation check.
    energy = np.maximum(0, squared[size:] - squared[:-size] - np.sum(window_sums ** 2, axis=1) / size)
    normalized = values / np.maximum(np.sqrt(energy * reference_energy), 1e-12)
    position = int(np.argmax(normalized))
    excerpt = search[position:position + size]
    return {'status': 'MEASURED', 'position': position,
            'correlation': float(normalized[position]),
            'levelRatio': float(np.linalg.norm(excerpt) / np.linalg.norm(reference)),
            'dcDifference': (excerpt.mean(axis=0) - reference.mean(axis=0)).tolist(),
            'relativeRmsError': float(np.linalg.norm(excerpt-reference) / np.linalg.norm(reference))}

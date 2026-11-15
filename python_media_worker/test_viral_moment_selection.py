import math
from python_media_worker.viral_moment_selection import build_moment_candidates, finalize_moments, selection_settings, select_diverse

def segment(start,end,text,confidence=.94):
    return dict(start=start,end=end,text=text,transcriptConfidence=confidence)

def test_a_complete_question_and_answer_beats_keyword_stuffing_and_a_late_outro():
    data=[segment(0,20,'Secret hack guaranteed money millions! Subscribe and use my code.'),
          segment(25,33,'Why did you stop counting clicks?'),
          segment(33,50,'Because clicks hid the real problem. We measured repeat purchases instead, and finally learned which customers stayed.'),
          segment(65,86,'Thanks for watching. Like and share, subscribe, link in bio, money secret win!')]
    result=finalize_moments(build_moment_candidates(data,[(0,100)],100,settings={'minDuration':15,'maxDuration':30}))
    assert result[0]['start']==25 and result[0]['end']==50
    assert 'counting clicks' in result[0]['text'] and 'customers stayed' in result[0]['text']
    assert result[0]['viralScore']>result[-1]['viralScore']
    assert result[0]['scoreConfidence'] != result[0]['viralScore']

def test_a_visual_cut_does_not_expand_a_sentence_into_an_unrelated_topic():
    data=[segment(8,18,'Why did the launch fail?'),segment(18,33,'Because we skipped customer research. The lesson is to test demand before building.')]
    result=build_moment_candidates(data,[(0,120)],120,settings={'minDuration':15,'maxDuration':30})
    assert result[0]['start']==8 and result[0]['end']==33

def test_lengths_are_real_candidate_constraints_and_short_sources_are_explicit():
    data=[segment(t,t+10,f'Step {t}: try the example and remember the result.') for t in range(0,100,10)]
    for minimum,maximum in [(15,30),(30,60),(60,90)]:
        result=build_moment_candidates(data,[],100,settings={'minDuration':minimum,'maxDuration':maximum})
        assert result and all(minimum<=r['duration']<=maximum for r in result)
    short=build_moment_candidates([segment(0,8,'A complete short answer.')],[],8)
    assert short and short[0]['end']==8 and not short[0]['durationMatchesRequest']
    assert short[0]['reviewFlags']

def test_word_timestamps_keep_sentence_edges_and_code_switching():
    data=[segment(0,32,'Kulungile, this is why. Because we tested the idea. This topic is unrelated.')]
    data[0]['words']=[{'word':w,'start':s,'end':e} for w,s,e in [
        ('Kulungile,',1,2),('this',2,3),('is',3,4),('why.',4,6),
        ('Because',7,8),('we',8,9),('tested',9,10),('the',10,11),('idea.',11,17),
        ('This',24,25),('topic',25,26),('is',26,27),('unrelated.',27,31)]]
    result=build_moment_candidates(data,[],35,settings={'minDuration':10,'maxDuration':20})
    assert result[0]['start']==1 and result[0]['end']==17
    assert result[0]['text'].startswith('Kulungile,')
    assert 'unrelated' not in result[0]['text']

def test_low_confidence_and_nonfinite_segments_do_not_create_fake_speech():
    data=[segment(float('nan'),float('inf'),'Bad timestamps'),segment(0,18,'Hallucinated claim.',.1)]
    result=build_moment_candidates(data,[(0,40)],40,settings={'minDuration':15,'maxDuration':30},motion=[(t,0.1) for t in range(40)])
    assert result and all(not r['text'] and not r['speechTrusted'] for r in result)
    assert all(math.isfinite(r['start']) and 0<=r['start']<r['end']<=40 for r in result)

def test_visual_peak_includes_setup_and_aftermath_without_inventing_dialogue():
    motion=[(t,1 if t==45 else .01) for t in range(90)]
    result=build_moment_candidates([],[(0,90)],90,settings={'minDuration':15,'maxDuration':30},motion=motion)
    assert result[0]['start']<45<result[0]['end']
    assert result[0]['text']=='' and result[0]['analysisMode']=='visual_only'
    assert result[0]['scoreConfidenceLabel']=='Exploratory evidence'

def test_repeated_passages_are_not_sold_as_different_highlights():
    text='Why did the project improve? Because customer research changed our plan and the result was useful.'
    data=[segment(5,30,text),segment(65,90,text),segment(115,140,'First try the cheaper option. The example shows a different practical step.')]
    result=build_moment_candidates(data,[],150,settings={'minDuration':15,'maxDuration':30})
    assert sum(r['text']==text for r in result)==1
    assert len(result)==2

def test_fresh_finalization_is_deterministic_and_ai_scores_have_bounded_influence():
    data=[segment(0,20,'How do we make this useful? Because the example gives a clear answer.')]
    rows=build_moment_candidates(data,[],20)
    before=finalize_moments(rows)
    assert finalize_moments(rows)==before
    after=finalize_moments([dict(rows[0],aiRankScore=999)])
    assert after[0]['viralScore']-before[0]['viralScore']<=5
    assert after[0]['start']==before[0]['start'] and after[0]['text']==before[0]['text']

def test_focus_is_evidence_based_and_does_not_invent_a_match():
    data=[segment(0,20,'How did customer retention improve? Because we fixed onboarding.'),segment(35,55,'What happened to the garden? Because rain returned the plants recovered.')]
    rows=build_moment_candidates(data,[],60,settings={'minDuration':15,'maxDuration':30,'focus':'customer retention'})
    assert rows[0]['start']==0 and rows[0]['scoreBreakdown']['focusMatch']>0
    assert rows[-1]['scoreBreakdown']['focusMatch']==0

def test_empty_or_invalid_duration_is_not_a_fake_success():
    assert build_moment_candidates([],[],0)==[]
    assert build_moment_candidates([],[],float('nan'))==[]

def test_legacy_packaging_breakdowns_cannot_inflate_all_editorial_scores_to_96():
    rows=build_moment_candidates([segment(0,20,'How does this work? Because practice gives a useful result.')],[],20)
    base=finalize_moments(rows)[0]['viralScore']
    legacy=dict(rows[0],scoreBreakdown={'speech':99,'energy':99,'motion':99,'durationFit':99},viralScore=99)
    result=finalize_moments([legacy])[0]
    assert result['viralScore']==base<96
    assert result['scoreBreakdown']==rows[0]['editorialBreakdown']

def test_a_loud_truncated_tail_does_not_win_over_a_complete_sentence_window():
    data=[segment(0,8,'I have been stood up, misunderstood, and disappointed.'),
          segment(8.5,14,'Yet every morning I still believe tomorrow might be kinder.'),
          segment(14.5,20,'I build ideas that visit me in dreams.'),
          segment(20.5,29.9,'Maybe success has taken the long road but neither one gets to the')]
    result=build_moment_candidates(data,[],29.9,settings={'minDuration':15,'maxDuration':30},audio=[(t,t) for t in range(30)])
    assert result[0]['end']==20
    assert result[0]['text'].endswith('dreams.')
    assert all(r['reviewFlags'] for r in result if not r['text'].endswith('.'))

def test_a_pause_after_a_comma_keeps_its_list_in_the_same_sentence():
    from python_media_worker.viral_moment_selection import speech_units
    data=[segment(0,8,'I have been stood up, misunderstood and disappointed.')]
    data[0]['words']=[dict(word=w,start=s,end=e) for w,s,e in [
        ('I',0,.2),('have',.2,.4),('been',.4,.6),('stood',.6,1),('up,',1,1.3),
        ('misunderstood',2.5,3),('and',3,3.2),('disappointed.',3.2,4)]]
    units=speech_units(data,8)
    assert len(units)==1 and units[0]['text'].startswith('I have') and units[0]['completeEnd']

def test_scoring():
    from zxcvbn.scoring import most_guessable_match_sequence

    brute = most_guessable_match_sequence("abcd", [])
    match = {"pattern": "sequence", "token": "abcd", "i": 0, "j": 3,
             "ascending": True, "guesses": 8}
    best = most_guessable_match_sequence("abcd", [match])
    assert brute["sequence"][0]["pattern"] == "bruteforce"
    assert [part["pattern"] for part in best["sequence"]] == ["sequence"]
    assert 0 < best["guesses"] < brute["guesses"]


def test_time_estimates():
    from zxcvbn.time_estimates import estimate_attack_times

    weak = estimate_attack_times(10)
    strong = estimate_attack_times(10**12)
    assert weak["score"] == 0 and strong["score"] == 4
    assert weak["crack_times_seconds"]["online_no_throttling_10_per_second"] == 1
    assert weak["crack_times_display"]["online_no_throttling_10_per_second"]


def test_feedback():
    from zxcvbn.feedback import get_feedback

    sequence = [{"pattern": "date", "token": "11/11/2000"}]
    weak = get_feedback(1, sequence)
    assert "date" in weak["warning"].lower()
    assert weak["suggestions"]
    assert get_feedback(4, sequence) == {"warning": "", "suggestions": []}

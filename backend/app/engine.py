"""Deterministic number-target simulation, independent of persistence."""
import random


def simulate(config: dict) -> tuple[dict, list[dict]]:
    rng = random.Random(config["seed"])
    value = 0
    trace = []
    contributions = {agent["name"]: 0 for agent in config["agents"]}
    rounds = 0
    for round_number in range(1, config["max_rounds"] + 1):
        rounds = round_number
        for agent in config["agents"]:
            remaining = config["target"] - value
            if agent["strategy"] == "greedy":
                action = min(10, remaining)
                reasoning = "Take up to 10 toward the remaining target."
            elif agent["strategy"] == "cautious":
                action = min(3, remaining)
                reasoning = "Take up to 3 toward the remaining target."
            else:
                action = rng.randint(1, min(10, remaining))
                reasoning = "Choose a seeded random step up to 10 and the remaining target."
            before = value
            value += action
            contributions[agent["name"]] += action
            trace.append({"sequence": len(trace) + 1, "round": round_number,
                          "agent": agent["name"], "strategy": agent["strategy"],
                          "observation": {"value": before, "target": config["target"]},
                          "action": action, "reasoning": reasoning,
                          "value_before": before, "value_after": value})
            if value == config["target"]:
                break
        if value == config["target"]:
            break
    result = {"final_value": value, "target_reached": value == config["target"],
              "rounds": rounds, "total_actions": len(trace),
              "scores": [{"agent": a["name"], "contribution": contributions[a["name"]]}
                         for a in config["agents"]]}
    return result, trace

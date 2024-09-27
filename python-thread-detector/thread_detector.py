import threading


def are_launchdarkly_threads_running():
    eventThreadActive = False
    streamThreadActive = True  # undetectable, for now

    for thread in threading.enumerate():
        if "ldclient.flush" in thread.name:
            eventThreadActive = True
        if "eventsource" in thread.name:
            streamThreadActive = True

        # Break early if both conditions are met
        if eventThreadActive and streamThreadActive:
            break

    return eventThreadActive and streamThreadActive


# Example usage
if are_launchdarkly_threads_running():
    print("Both patterns found in threads.")
else:
    print("Both patterns not found in threads.")

# LaunchDarkly thread detector for Python

This project contains a function that can be used to detect if the SDK has been initialized properly. The SDK should be initialized after forking, otherwise the necessary threads that keep the SDKs targeting rules up to date and the thread that delivers events back to LaunchDarkly will not be started. This will prevent the SDK from receiving any updates until the next time you restart your applicaiton.

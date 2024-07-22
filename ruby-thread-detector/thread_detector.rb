# Copy this function into your application to detect if the LaunchDarkly SDK has been implemented properly.
# This function will return true if both are running in the same thread, and false otherwise.

def are_launchdarkly_threads_running?
  has_launchdarkly = false
  has_ld_eventsource = false

  Thread.list.each do |thread|
    next unless thread.backtrace

    backtrace = thread.backtrace.join("\n")
    has_launchdarkly = true if backtrace.include?('launchdarkly-server-sdk')
    has_ld_eventsource = true if backtrace.include?('ld-eventsource')

    # Break early if both conditions are met
    break if has_launchdarkly && has_ld_eventsource
  end

  has_launchdarkly && has_ld_eventsource
end

# Example usage
if are_launchdarkly_threads_running?
  puts "Both patterns found in threads."
else
  puts "Both patterns not found in threads."
end
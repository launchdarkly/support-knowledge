import json
import sys
import csv

if __name__ == "__main__":

  with open(sys.argv[1]) as data_file:
      data = json.load(data_file)
      if "segments" not in data.keys():
        print("The segments object is missing. Do you have the right payload or file from https://stream.launchdarkly.com/all?")
      elif len(data["segments"]) == 0:
        print("Segments are not being used in this environment.")
      else:
        emptySegmentKeys = []
        for segKey, seg in data["segments"].items():
            if "included" in seg.keys(): includedLength = len(seg["included"])
            if "excluded" in seg.keys(): excludedLength = len(seg["excluded"])
            includedContextsLength = len(seg["includedContexts"])
            excludedContextsLength = len(seg["excludedContexts"])
            rulesLength = len(seg["rules"])
            if rulesLength == 0 and excludedContextsLength == 0 and includedContextsLength == 0 and excludedLength == 0 and includedLength == 0:
                emptySegmentKeys.append(segKey)
            else:
                continue
 
      # print(len(emptySegmentKeys))
      emptySegments = []
      if len(emptySegmentKeys) > 0:
         for someSegment in emptySegmentKeys:
            foundSegment = data["segments"][someSegment]
            # print(foundSegment)
            emptySegments.append(foundSegment)

      columnHeaders = emptySegments[0].keys()

      with open('unused_ld_segments.csv', 'w', newline='') as output_file:
        dict_writer = csv.DictWriter(output_file, columnHeaders)
        dict_writer.writeheader()
        dict_writer.writerows(emptySegments)

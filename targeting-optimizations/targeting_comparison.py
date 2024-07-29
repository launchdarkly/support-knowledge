import json
import sys

if __name__ == "__main__":

    seen = set()
    repeats = set()
    duplicates_across_resources = {} # { contextKey<type:string>: nested_dictionary, ...  }
    
    with open(sys.argv[1]) as data_file:
        data = json.load(data_file)
        for k, v in data.items():
            for flagKey, item in v.items():
                if "included" in item and len(item["included"]) > 0:
                # get unique values only
                    included_set = set(item["included"])
                    included_list = item["included"]                       
                    # check if the current included payload has matches with other flags
                    for ctx in included_set:
                        if ctx in seen:
                            repeats.add(ctx)
                            if ctx not in duplicates_across_resources.keys():
                                nested_dictionary = { "occurrences": 2, "duplicate_flag_or_segment_key": [":".join([k, flagKey])] }
                                duplicates_across_resources[ctx] = nested_dictionary
                            else:
                                duplicates_across_resources[ctx]["occurrences"] += 1
                                duplicates_across_resources[ctx]["duplicate_flag_or_segment_key"].append(":".join([k, flagKey]))
                        else:
                            seen.add(ctx)

        byte_array = [duplicates_across_resources[ctx]["occurrences"] * (len(ctx) + 3) for ctx in duplicates_across_resources.keys()]
        byte_sum = sum(byte_array)

        json_data = {
            "duplicate_byte_sum": byte_sum,
            "duplicate_context_keys": duplicates_across_resources 
        }

        with open('ld_target_duplicates.json', 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=4)

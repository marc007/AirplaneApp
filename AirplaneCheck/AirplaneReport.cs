using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

using Android.App;
using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Views;
using Android.Widget;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace AirplaneCheck
{
	class AirplaneReport
    {
		public AirplaneReport()
        {
			list = new List<AirplaneReport>();
        }
		[JsonProperty(PropertyName = "IATA")]
		public string IATA { get; set; }
		[JsonProperty(PropertyName = "city")]
		public string city { get; set; }
		[JsonProperty(PropertyName = "state")]
		public string state { get; set; }
        [JsonProperty(PropertyName = "list")]
		public List<AirplaneReport> list { get; set; }
    }

}
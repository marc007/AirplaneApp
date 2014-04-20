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

using Parse;

namespace AirplaneCheck
{
	public class AirplaneInfo
	{
		public AirplaneInfo() {
		}

		public AirplaneInfo(ParseObject p) {
			airplanenumber = p.Get<string> ("nnumber");
			model = p.Get<string> ("NAME");
			airWorthDate = DateTime.Parse( p.Get<string> ("airWorthDate"));
			statusCode = p.Get<string> ("statusCode");
		}

		public int? id { get; set; }
		public string airplanenumber { get; set; }
		public string model { get; set; }
		public DateTime airWorthDate { get; set; }
		public string statusCode { get; set; }
	}
}


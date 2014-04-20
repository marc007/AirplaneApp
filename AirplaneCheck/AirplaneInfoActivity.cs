using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

using Android.App;
using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Views;
using Android.Widget;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

using Parse;

namespace AirplaneCheck
{
	[Activity (Label = "Airplane Info")]			
	public class AirplaneInfoActivity : ListActivity
	{
		async protected override void OnCreate (Bundle bundle)
		{
			base.OnCreate (bundle);

			//Parse initialization
			ParseClient.Initialize ("VzfpPQ473axJ5uRnQJlLwP35DgsaybTzy9JdSpKs", "eXqhwXdFVwYba7FIEKUs5SIWEHAfvTH7RgmsNNgs");

			var airplanenumber = Intent.GetStringExtra("AirplaneNumber");
			if (!airplanenumber.StartsWith ("N")) airplanenumber = String.Format("N{0}", Intent.GetStringExtra("AirplaneNumber"));

			List<AirplaneInfo> ars = await GetData (airplanenumber);
			ListAdapter = new AirplaneInfoAdapter (this, ars);
        }

		async Task<List<AirplaneInfo>> GetData(string airplanenumber)
		{
			List<AirplaneInfo> airplanenumbers = new List<AirplaneInfo>();
            try
            {
				var query = from faamaster in ParseObject.GetQuery("FAAmaster")
							where faamaster.Get<string>("nnumber").StartsWith(airplanenumber)
							select faamaster;
				Task<IEnumerable<ParseObject>> numbersTask = query.FindAsync ();

				IEnumerable<ParseObject> airplanes = await numbersTask;

				foreach (var airplane in airplanes) {
					airplanenumbers.Add( new AirplaneInfo(airplane));
				}
            }
            catch (System.Exception sysExc)
            {
                Console.WriteLine(sysExc.Message);
            }
			return airplanenumbers;
        }
	}
}


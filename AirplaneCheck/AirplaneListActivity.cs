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
	[Activity (Label = "Airplane List")]			
	public class AirplaneListActivity : Activity
	{
		ListView _airplanelistview;

		async protected override void OnCreate (Bundle bundle)
		{
			base.OnCreate (bundle);

			//Parse initialization
			ParseClient.Initialize ("VzfpPQ473axJ5uRnQJlLwP35DgsaybTzy9JdSpKs", "eXqhwXdFVwYba7FIEKUs5SIWEHAfvTH7RgmsNNgs");

			var airplanenumber = Intent.GetStringExtra("AirplaneNumber");
			if (!airplanenumber.StartsWith ("N"))
				airplanenumber = String.Format("N{0}", airplanenumber);

			bool result = await GetData (airplanenumber);

			// Set our view from the "AirplaneList" layout resource
			SetContentView (Resource.Layout.AirplaneList);

			_airplanelistview = FindViewById<ListView> (Resource.Id.AirplaneListView);
			_airplanelistview.Adapter = new AirplaneInfoAdapter (this);

		}

		async Task<bool> GetData(string airplanenumber)
		{
			bool _result = false;
            try
            {
				var query = from faamaster in ParseObject.GetQuery("FAAmaster")
							where faamaster.Get<string>("nnumber").StartsWith(airplanenumber)
							select faamaster;
				Task<IEnumerable<ParseObject>> numbersTask = query.FindAsync ();

				IEnumerable<ParseObject> airplanes = await numbersTask;

				foreach (var airplane in airplanes) {
					AirplaneInfoData.Service.SaveAirplaneInfo( new AirplaneInfo(airplane));
				}

				_result = true;
				Console.WriteLine(String.Format("Total Airplanes:{0}",AirplaneInfoData.Service.AirplaneInfos.Count));
            }
            catch (System.Exception sysExc)
            {
                Console.WriteLine(sysExc.Message);
            }
			return _result;
        }
	}
}

